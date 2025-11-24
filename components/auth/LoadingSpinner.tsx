interface LoadingSpinnerProps {
  size?: string;
}

export const LoadingSpinner = ({ size = "h-4 w-4" }: LoadingSpinnerProps) => (
  <div
    className={`${size} border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin`}
    role="status"
    aria-label="読み込み中"
  />
);
