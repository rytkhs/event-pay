import React from 'react';
import { useViewportSize } from '@/lib/hooks/useViewportSize';
import { cn } from '@/lib/utils';

interface AuthFormMobileProps {
  type: 'login' | 'register';
  onSubmit: (data: any) => void;
  className?: string;
}

export const AuthFormMobile: React.FC<AuthFormMobileProps> = ({
  type,
  onSubmit,
  className,
}) => {
  const { isMobile, isTablet, isDesktop } = useViewportSize();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({});
  };

  const getFormClasses = () => {
    const baseClasses = [
      'auth-form-mobile',
      'w-full',
      'max-w-md',
      'mx-auto',
      'p-6',
      'space-y-4',
    ];

    if (isMobile) {
      baseClasses.push(
        'mobile-form-layout',
        'flex',
        'flex-col',
        'space-y-6'
      );
    } else if (isTablet) {
      baseClasses.push(
        'tablet-form-layout',
        'grid',
        'grid-cols-1',
        'gap-4'
      );
    } else if (isDesktop) {
      baseClasses.push(
        'desktop-form-layout',
        'grid',
        'grid-cols-2',
        'gap-6'
      );
    }

    return cn(baseClasses, className);
  };

  const getFieldsClasses = () => {
    const baseClasses = ['form-fields'];

    if (isMobile) {
      baseClasses.push(
        'mobile-fields-stacked',
        'flex',
        'flex-col',
        'space-y-4'
      );
    } else if (isTablet) {
      baseClasses.push(
        'tablet-fields-inline',
        'grid',
        'grid-cols-1',
        'gap-4'
      );
    } else if (isDesktop) {
      baseClasses.push(
        'desktop-fields-optimized',
        'grid',
        'grid-cols-2',
        'gap-4'
      );
    }

    return cn(baseClasses);
  };

  const getFieldClasses = () => {
    const baseClasses = [
      'form-field',
      'w-full',
      'px-3',
      'py-2',
      'border',
      'border-gray-300',
      'rounded-md',
      'focus:outline-none',
      'focus:ring-2',
      'focus:ring-blue-500',
      'focus:border-transparent',
    ];

    if (isMobile) {
      baseClasses.push(
        'mobile-field-stacked',
        'min-h-[44px]',
        'text-base'
      );
    } else if (isTablet) {
      baseClasses.push(
        'tablet-field-inline',
        'min-h-[36px]',
        'text-sm'
      );
    } else if (isDesktop) {
      baseClasses.push(
        'desktop-field-optimized',
        'min-h-[32px]',
        'text-sm'
      );
    }

    return cn(baseClasses);
  };

  return (
    <form
      role="form"
      onSubmit={handleSubmit}
      className={getFormClasses()}
    >
      <div data-testid="form-fields" className={getFieldsClasses()}>
        {type === 'login' ? (
          <>
            <input
              type="email"
              name="email"
              placeholder="メールアドレス"
              className={getFieldClasses()}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="パスワード"
              className={getFieldClasses()}
              required
            />
          </>
        ) : (
          <>
            <input
              type="text"
              name="name"
              placeholder="名前"
              className={getFieldClasses()}
              required
            />
            <input
              type="email"
              name="email"
              placeholder="メールアドレス"
              className={getFieldClasses()}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="パスワード"
              className={getFieldClasses()}
              required
            />
            <input
              type="password"
              name="confirmPassword"
              placeholder="パスワード確認"
              className={getFieldClasses()}
              required
            />
          </>
        )}
      </div>
      
      <button
        type="submit"
        data-testid="screen-reader-button"
        aria-describedby="submit-description"
        className={cn(
          'w-full',
          'px-4',
          'py-2',
          'bg-blue-600',
          'text-white',
          'rounded-md',
          'hover:bg-blue-700',
          'focus:outline-none',
          'focus:ring-2',
          'focus:ring-blue-500',
          'focus:ring-offset-2',
          'transition-colors',
          'duration-200',
          isMobile && 'min-h-[44px]',
          isTablet && 'min-h-[36px]',
          isDesktop && 'min-h-[32px]'
        )}
      >
        {type === 'login' ? 'ログイン' : '登録'}
      </button>
      
      <div id="submit-description" className="sr-only">
        {type === 'login' ? 'ログインフォームを送信' : '登録フォームを送信'}
      </div>
    </form>
  );
};