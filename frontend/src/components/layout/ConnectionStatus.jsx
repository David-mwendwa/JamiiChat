import { useSocket } from '../../socket/SocketProvider.jsx';

// Says out loud when the live connection has dropped. The API sleeps on a free
// hosting tier, so "reconnecting" is a real state a reader will meet — and a
// feed that has silently stopped updating is worse than one that admits it.
const ConnectionStatus = () => {
  const { status } = useSocket();

  if (status !== 'reconnecting') return null;

  return (
    <p
      role="status"
      className="mt-3 flex items-center gap-2 rounded-xl bg-secondary-50 px-3 py-2 text-xs font-medium text-secondary-800 dark:bg-secondary-950/40 dark:text-secondary-300">
      <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-500" />
      Reconnecting — live updates are paused
    </p>
  );
};

export default ConnectionStatus;
