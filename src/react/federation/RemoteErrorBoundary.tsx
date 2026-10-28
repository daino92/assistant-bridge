import { Component, type ReactNode } from 'react';

interface RemoteErrorBoundaryProps {
  children: ReactNode;
  onError: () => void;
}

interface RemoteErrorBoundaryState {
  failed: boolean;
}

class RemoteErrorBoundary extends Component<RemoteErrorBoundaryProps, RemoteErrorBoundaryState> {
  state: RemoteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError = (): RemoteErrorBoundaryState => ({ failed: true });

  componentDidCatch = () => {
    this.props.onError();
  };

  render = () => (this.state.failed ? null : this.props.children);
}

export default RemoteErrorBoundary;
