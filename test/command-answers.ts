import type { AssistantCommandName, AssistantCommandResultData } from '@/contracts';

/** What a conforming assistant answers to each host command. */
export const COMMAND_ANSWERS: AssistantCommandResultData = {
  'assistant.open': { opened: true },
  'assistant.close': { closed: true },
  'assistant.focus': { focused: true },
  'assistant.prefill': { prefilled: true },
  'assistant.submitPrompt': { accepted: true },
};

/** A test receiver that answers like a conforming assistant. */
export const answer = (request: { command: string }) =>
  COMMAND_ANSWERS[request.command as AssistantCommandName];
