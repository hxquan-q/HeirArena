import { Component, type ReactNode } from 'react'

interface VoxelErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

interface VoxelErrorBoundaryState {
  failed: boolean
}

export default class VoxelErrorBoundary extends Component<VoxelErrorBoundaryProps, VoxelErrorBoundaryState> {
  state: VoxelErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): VoxelErrorBoundaryState {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
