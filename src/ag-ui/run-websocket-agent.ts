import type { AgentSubscriber } from '@ag-ui/client';

import { ERROR_CODES } from '@/contracts';
import { createIntegrationError, normalizeIntegrationError } from '@/errors';

import {
  createRunError,
  normalizeRunError,
  isRunErrorCode,
  RUN_ERROR_CODES,
  WebSocketAgent,
  hostAgentStateSchema,
  type AgentOptions,
} from '@/ag-ui';

type ToolCallEndParams = Parameters<NonNullable<AgentSubscriber['onToolCallEndEvent']>>[0];

/** Compatibility facade: callers keep the same API while the official client owns message state. */
export const runWebSocketAgent = async (options: AgentOptions): Promise<void> => {
  options.signal.throwIfAborted();

  const agent = new WebSocketAgent(options);
  const initialIds = new Set(options.input.messages.map((message) => message.id));
  const executed = new Set<string>();
  let availableTools = options.input.tools;
  let displayed = '';
  let failure: Error | undefined;

  const fail = (error: Error) => {
    failure ??= error;
    agent.abortRun();
  };

  const dispatchTool = async ({ event, toolCallName, messages }: ToolCallEndParams) => {
    if (failure || options.signal.aborted) {
      return;
    }

    if (executed.has(event.toolCallId)) {
      fail(createRunError(RUN_ERROR_CODES.PROTOCOL_ERROR));

      return;
    }

    executed.add(event.toolCallId);

    try {
      options.onActivity?.(`Running ${toolCallName}\u2026`);
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Unable to display tool activity.'));

      return;
    }

    let content: string;
    let error: string | undefined;
    let rejected = false;
    let args: unknown;

    try {
      if (!options.executeTool) {
        throw createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE);
      }

      const call = messages
        .flatMap((message) => (message.role === 'assistant' ? (message.toolCalls ?? []) : []))
        .find((item) => item.id === event.toolCallId);

      if (!call) {
        throw createIntegrationError(ERROR_CODES.INVALID_PAYLOAD);
      }

      // Parse the exact completed payload: the library intentionally tolerates malformed JSON.
      args = JSON.parse(call.function.arguments || '{}');
      options.onToolActivity?.({
        id: event.toolCallId,
        name: toolCallName,
        status: 'running',
        args,
      });

      const result = await options.executeTool(toolCallName, args, {
        actionExecutionId: crypto.randomUUID(),
        toolCallId: event.toolCallId,
        onActionLifecycle: options.onActionLifecycle,
      });

      content = JSON.stringify(result ?? null);
    } catch (reason) {
      const detail = normalizeIntegrationError(reason);

      rejected = detail.code === ERROR_CODES.ACTION_REJECTED;
      error = detail.message;
      content = error;
    }

    if (failure || options.signal.aborted) {
      return;
    }

    options.onToolActivity?.({
      id: event.toolCallId,
      name: toolCallName,
      args,
      status: error ? (rejected ? 'rejected' : 'failed') : 'succeeded',
      ...(error ? { error } : {}),
    });

    const hostState = options.getHostState
      ? hostAgentStateSchema.parse(options.getHostState())
      : undefined;

    if (hostState) {
      availableTools = hostState.tools;
    }

    agent.sendToolResult(
      options.input.runId,
      {
        id: crypto.randomUUID(),
        role: 'tool',
        toolCallId: event.toolCallId,
        content,
        ...(error ? { error } : {}),
      },
      hostState,
    );
  };

  const subscriber: AgentSubscriber = {
    onMessagesChanged: ({ messages }) => {
      if (failure || options.signal.aborted) {
        return;
      }

      const text = messages
        .filter(
          (message) =>
            !initialIds.has(message.id) &&
            message.role === 'assistant' &&
            typeof message.content === 'string' &&
            message.content.length > 0,
        )
        .map((message) => message.content)
        .join('\n\n');

      if (text.length > 200_000) {
        fail(createRunError(RUN_ERROR_CODES.RESPONSE_TOO_LARGE));

        return;
      }

      if (text !== displayed) {
        displayed = text;

        try {
          options.onText(text);
        } catch (error) {
          fail(error instanceof Error ? error : new Error('Unable to display assistant response.'));
        }
      }
    },
    onRunErrorEvent: ({ event }) => {
      fail(createRunError(normalizeRunError(event).code));
    },
    onToolCallStartEvent: ({ event }) => {
      if (
        executed.has(event.toolCallId) ||
        !availableTools.some((tool) => tool.name === event.toolCallName)
      ) {
        fail(createRunError(RUN_ERROR_CODES.PROTOCOL_ERROR));
      }
    },
    onToolCallArgsEvent: ({ toolCallBuffer }) => {
      if (toolCallBuffer.length > 32_000) {
        fail(createRunError(RUN_ERROR_CODES.PROTOCOL_ERROR));
      }
    },
    onToolCallEndEvent: (params) => {
      // The BFF waits for the result. Keep the event pipeline cancellable while the host acts.
      void dispatchTool(params).catch((error) => {
        fail(error instanceof Error ? error : new Error('Host tool dispatch failed.'));
      });
    },
  };

  try {
    await agent.runAgent(
      {
        runId: options.input.runId,
        tools: options.input.tools,
        context: options.input.context,
        forwardedProps: options.input.forwardedProps,
        ...(options.input.resume ? { resume: options.input.resume } : {}),
      },
      subscriber,
    );
  } catch (error) {
    if (options.signal.aborted) {
      throw options.signal.reason ?? error;
    }

    const suppliedCode =
      error && typeof error === 'object' && 'code' in error ? error.code : undefined;

    throw failure
      ? createRunError(normalizeRunError(failure).code)
      : createRunError(
          isRunErrorCode(suppliedCode) ? suppliedCode : RUN_ERROR_CODES.PROTOCOL_ERROR,
        );
  }

  if (failure) {
    throw createRunError(normalizeRunError(failure).code);
  }

  options.signal.throwIfAborted();
};
