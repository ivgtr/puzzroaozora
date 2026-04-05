interface AppIconProps {
  size?: number;
  className?: string;
}

export function AppIcon({ size = 24, className }: AppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="10" y="3" width="18" height="4.5" rx="1" />
      <rect x="3" y="10.5" width="12" height="4.5" rx="1" />
      <rect x="7" y="18" width="21" height="4.5" rx="1" />
      <rect x="13" y="25.5" width="15" height="4.5" rx="1" />
    </svg>
  );
}
