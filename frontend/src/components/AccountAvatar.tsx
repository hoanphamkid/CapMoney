import { UserRound } from 'lucide-react';
import { useState } from 'react';

export function AccountAvatar({ name, src, className = '' }: { name?: string; src?: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span className={`cm-account-avatar ${className}`} aria-hidden="true">
      {src && src !== failedSrc
        ? <img src={src} alt="" onError={() => setFailedSrc(src)} />
        : name?.trim().charAt(0).toUpperCase() || <UserRound size={23} />}
    </span>
  );
}
