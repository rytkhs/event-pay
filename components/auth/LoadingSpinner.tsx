interface LoadingSpinnerProps {
  size?: string;
  color?: "white" | "gray";
}

export const LoadingSpinner = ({ size = "h-4 w-4", color = "gray" }: LoadingSpinnerProps) => {
  const borderClasses =
    color === "white" ? "border-white/30 border-t-white" : "border-gray-300 border-t-gray-900";

  return (
    <div
      className={`${size} border-2 ${borderClasses} rounded-full animate-spin`}
      role="status"
      aria-label="読み込み中"
    />
  );
};
