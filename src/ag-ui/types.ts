import type { RunAgentInput } from '@ag-ui/core';

import type { AgentStompDestinations, HostAgentState } from '@/ag-ui';
import type { ActionExecutionOptions } from '@/assistant-client';
import type { ActionLifecycleListener } from '@/contracts';

export interface ToolActivity {
  id: string;
  name: string;
  status: 'running' | 'succeeded' | 'failed' | 'rejected';
  args?: unknown;
  error?: string;
}

export type { ActionConfirmation } from '@/assistant-client';

export interface AgentOptions {
  transport?: 'websocket' | 'stomp';
  /** Overrides AGENT_STOMP_DESTINATIONS for backends using other paths. Ignored for raw WebSocket. */
  stompDestinations?: AgentStompDestinations;
  url: string;
  input: RunAgentInput;
  signal: AbortSignal;
  onText: (text: string) => void;
  onActivity?: (text: string) => void;
  onActionLifecycle?: ActionLifecycleListener;
  onToolActivity?: (activity: ToolActivity) => void;
  executeTool?: (
    name: string,
    args: unknown,
    execution?: ActionExecutionOptions,
  ) => Promise<unknown>;
  getHostState?: () => HostAgentState;
  timeoutMs?: number;
}

export type WebSocketAgentOptions = Pick<
  AgentOptions,
  'url' | 'input' | 'signal' | 'timeoutMs' | 'transport' | 'stompDestinations'
>;
