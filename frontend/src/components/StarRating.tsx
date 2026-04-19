import { useState } from 'react';

interface StarRatingProps {
  /** Current value (1-5). 0 = none selected */
  value: number;
  /** If true, clicking stars changes value (interactive). If false, display-only. */
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export default function StarRating({ value, interactive = false, onChange, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const effective = hovered || value;
  const starSize = sizeMap[size];

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className={[
            starSize,
            'transition-colors duration-100',
            interactive ? 'cursor-pointer' : 'cursor-default',
            effective >= star
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-300 fill-gray-300',
          ].join(' ')}
          onMouseEnter={() => interactive && setHovered(star)}
          onClick={() => interactive && onChange?.(star)}
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  );
}
