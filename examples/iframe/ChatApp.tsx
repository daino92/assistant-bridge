import Chat from '../Chat';

// Demo only. Replace this function with your existing chat backend client.
const sendMessage = async (prompt: string): Promise<string> => `Demo reply: ${prompt}`;

// Mount in the iframe's React application. No bridge or onReady props are needed.
const ChatApp = () => <Chat sendMessage={sendMessage} />;

export default ChatApp;
