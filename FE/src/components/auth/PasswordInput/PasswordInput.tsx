import React, { useState } from 'react';
import './PasswordInput.css';

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const PasswordInput: React.FC<PasswordInputProps> = ({ className = '', ...props }) => {
  const [isVisible, setIsVisible] = useState(false);
  const hasValue = String(props.value ?? '').length > 0;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) setIsVisible(false);
    props.onChange?.(event);
  };

  return (
    <div className="auth-password-input-wrap">
      <input
        {...props}
        type={hasValue && isVisible ? 'text' : 'password'}
        onChange={handleChange}
        className={`${className} auth-password-input`.trim()}
      />
      {hasValue && (
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={isVisible ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
          aria-pressed={isVisible}
          title={isVisible ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
        >
          {isVisible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 3 18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 8 9 8a16.7 16.7 0 0 1-2.1 3.2" />
              <path d="M6.6 6.6C4.4 8.1 3 12 3 12s3.5 8 9 8a9.8 9.8 0 0 0 4.1-.9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-8 9-8 9 8 9 8-3.5 8-9 8-9-8-9-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

export default PasswordInput;
