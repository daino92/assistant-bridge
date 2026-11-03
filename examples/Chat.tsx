import { useCallback, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import type { EmbeddedAssistantOptions } from 'assistant-bridge';
import { useAssistantIntegration } from 'assistant-bridge/react';

interface Props extends Partial<EmbeddedAssistantOptions> {
  // Connect this to the chat app's existing backend, regardless of its protocol.
  sendMessage: (prompt: string) => Promise<string>;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const Chat = ({ bridge, onReady, sendMessage }: Props) => {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);

  const openChat = useCallback(() => setOpen(true), []);

  const closeChat = useCallback(() => setOpen(false), []);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  const prefill = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, []);

  // Both the composer and host commands use the same send flow.
  const submitPrompt = useCallback(
    (prompt: string) => {
      const text = prompt.trim();

      if (!text || sending.current) {
        throw new Error('Enter a message and wait for the current reply.');
      }

      sending.current = true;
      setBusy(true);
      setError('');
      setInput('');
      setMessages((previous) => [...previous, { role: 'user', text }]);

      void Promise.resolve()
        .then(() => sendMessage(text))
        .then((reply) => {
          setMessages((previous) => [...previous, { role: 'assistant', text: reply }]);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : 'Unable to send message.');
        })
        .finally(() => {
          sending.current = false;
          setBusy(false);
        });

      return { acknowledged: true };
    },
    [sendMessage],
  );

  // Direct/federated hosts supply bridge + onReady. Iframes use the SDK handshake.
  const { context, isConnected } = useAssistantIntegration({
    bridge,
    onReady,
    commands: {
      onOpen: openChat,
      onClose: closeChat,
      onFocus: focusInput,
      onPrefill: prefill,
      onSubmit: submitPrompt,
    },
  });

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      try {
        submitPrompt(input);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to send message.');
      }
    },
    [input, submitPrompt],
  );

  const changeInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  }, []);

  return (
    <>
      {!open && <button onClick={openChat}>Open chat</button>}
      <section aria-label="Chat" hidden={!open}>
        <header>
          <h2>{context?.page.title ?? 'Chat'}</h2>
          <p>{isConnected ? 'Connected to host' : 'Standalone chat'}</p>
          <button onClick={closeChat}>Close chat</button>
        </header>
        <ol aria-label="Messages" aria-live="polite">
          {messages.map((message, index) => (
            <li key={index}>
              <strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong> {message.text}
            </li>
          ))}
        </ol>
        {busy && <p role="status">Waiting for reply...</p>}
        {error && <p role="alert">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label htmlFor="chat-message">Message</label>
          <input id="chat-message" ref={inputRef} value={input} onChange={changeInput} />
          <button type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </>
  );
};

export default Chat;
