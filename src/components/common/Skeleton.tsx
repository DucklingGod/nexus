interface SkeletonProps {
  width?: string;
  height?: string;
  rounded?: boolean;
  className?: string;
}

export function Skeleton({ width = '100%', height = '1rem', rounded = false, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${rounded ? 'rounded-full' : 'rounded-md'} ${className}`}
      style={{ width, height }}
    />
  );
}
