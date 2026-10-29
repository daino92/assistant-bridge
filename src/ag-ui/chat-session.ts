import {
  createChatRunController,
  describeRunError,
  type ChatRunControllerOptions,
  type ChatRunStartOptions,
  type Message,
} from '@/ag-ui';
import {
  reduceActionProgress,
  finalizeActionProgress,
  type ActionProgressEntry,
  type ActionConfirmation,
} from '@/assistant-client';

export interface ChatSessionMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
  activity?: string;
  context?: ChatRunStartOptions['context'];
  actions?: (ActionProgressEntry & { label: string })[];
}

/** Storage and persistence remain owned by the consumer. All methods are synchronous. */
export interface ChatSessionStorage {
  getActiveId: () => string | null;
  createConversation: () => string;
  getMessages: (conversationId: string) => readonly ChatSessionMessage[];
  append: (conversationId: string, message: ChatSessionMessage) => void;
  update: (conversationId: string, messageId: string, patch: Partial<ChatSessionMessage>) => void;
}

export interface ChatSessionOptions extends ChatRunControllerOptions {
  storage: ChatSessionStorage;
  describeAction?: (action: Pick<ActionConfirmation, 'name' | 'args'>) => string;
}

export type ChatSessionSubmitOptions = Omit<
  ChatRunStartOptions,
  'threadId' | 'messages' | 'onText' | 'onActionLifecycle'
> & { retryId?: string };

/** Completed turns only, followed by the pending user prompt for this answer. */
export const buildAgentMessages = (
  messages: readonly ChatSessionMessage[],
  targetId: string,
): Message[] => {
  const history: Message[] = [];
  let pendingUser: Message | undefined;

  for (const message of messages) {
    if (message.id === targetId) {
      break;
    }

    if (message.role === 'user') {
      pendingUser = { id: message.id, role: 'user', content: message.text };
    } else {
      if (pendingUser && message.status === 'complete') {
        history.push(pendingUser, { id: message.id, role: 'assistant', content: message.text });
      }

      pendingUser = undefined;
    }
  }

  if (pendingUser) {
    history.push(pendingUser);
  }

  return history;
};

/** Optional conversation coordination on top of the independently usable run controller. */
export const createChatSession = (options: ChatSessionOptions) => {
  const { storage, describeAction = ({ name }) => name } = options;
  const controller = createChatRunController(options);
  let disposed = false;

  const submit = (prompt: string, request: ChatSessionSubmitOptions = {}) => {
    if (disposed || !prompt.trim() || controller.getSnapshot().status === 'running') {
      throw new Error('Wait for the current reply or stop it first.');
    }

    const { retryId, ...runOptions } = request;
    const activeId = storage.getActiveId();

    if (retryId) {
      const messages = activeId ? storage.getMessages(activeId) : [];
      const target = messages.at(-1);

      if (
        target?.id !== retryId ||
        target.role !== 'assistant' ||
        !['error', 'stopped'].includes(target.status)
      ) {
        throw new Error('Only the latest stopped or failed answer can be retried.');
      }
    }

    const conversationId = activeId ?? storage.createConversation();
    const messageId = retryId ?? crypto.randomUUID();

    const update = (patch: Partial<ChatSessionMessage>) =>
      storage.update(conversationId, messageId, patch);

    const getMessage = () =>
      storage.getMessages(conversationId).find((item) => item.id === messageId);

    const context = structuredClone(
      runOptions.context ?? (retryId ? getMessage()?.context : undefined),
    );

    if (!retryId) {
      storage.append(conversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        text: prompt.trim(),
        status: 'complete',
      });
      storage.append(conversationId, {
        id: messageId,
        role: 'assistant',
        text: '',
        status: 'streaming',
        ...(context ? { context } : {}),
      });
    } else {
      update({ text: '', activity: undefined, actions: [], status: 'streaming' });
    }

    return controller
      .start({
        ...runOptions,
        context,
        threadId: conversationId,
        messages: buildAgentMessages(storage.getMessages(conversationId), messageId),
        onText: (text) => update({ text, activity: undefined }),
        onActionLifecycle: (event, details) => {
          update({
            actions: reduceActionProgress(getMessage()?.actions ?? [], event, {
              label: describeAction({ name: event.action, args: details?.args }),
            }),
          });
        },
      })
      .then((result) => {
        if (result.status === 'completed') {
          update({ status: 'complete' });
        } else {
          update({
            actions: finalizeActionProgress(
              getMessage()?.actions ?? [],
              result.status === 'stopped' ? 'stopped' : 'failed',
            ),
            status: result.status === 'stopped' ? 'stopped' : 'error',
            activity:
              result.status === 'stopped' ? 'Response stopped.' : describeRunError(result.error),
          });
        }

        return result;
      });
  };

  return {
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    submit,
    stop: controller.stop,
    dispose: () => {
      disposed = true;
      controller.dispose();
    },
  };
};
