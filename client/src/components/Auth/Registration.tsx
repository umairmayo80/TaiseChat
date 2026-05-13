import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import React, { useContext, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import { dataService, loginPage, QueryKeys } from 'librechat-data-provider';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize, TranslationKeys } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

type RegistrationField = 'name' | 'email' | 'password' | 'confirm_password' | 'dateOfBirth';

const dateOfBirthRegex = /^\d{4}-\d{2}-\d{2}$/;

const parseDateOnly = (value: string) => {
  if (!dateOfBirthRegex.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const isValidDateOfBirth = (value: string) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return false;
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  if (parsed.year > currentYear) {
    return false;
  }
  if (parsed.year === currentYear && parsed.month > currentMonth) {
    return false;
  }
  return !(parsed.year === currentYear && parsed.month === currentMonth && parsed.day > currentDay);
};

const isAtLeast18 = (value: string) => {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return false;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - parsed.year;
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  if (currentMonth < parsed.month || (currentMonth === parsed.month && currentDay < parsed.day)) {
    age -= 1;
  }
  return age >= 18;
};

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { startupConfig, startupConfigError, isFetching } = useOutletContext<TLoginLayoutContext>();

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const validTheme = isDark(theme) ? 'dark' : 'light';

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);

  const {
    data: hunRegistration,
    isError: isHunError,
    isLoading: isHunLoading,
    refetch: refetchHun,
  } = useQuery([QueryKeys.hunRegistration], () => dataService.getHunRegistration(), {
    enabled: !startupConfigError && !isFetching,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: Infinity,
  });

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setIsSubmitting(false);
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            navigate('/c/new', { replace: true });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
      if ((error as TError).response?.status === 409) {
        refetchHun();
      }
    },
  });

  const renderInput = (
    id: RegistrationField,
    label: TranslationKeys,
    type: string,
    validation: object,
  ) => (
    <div className="mb-4">
      <div className="relative">
        <input
          id={id}
          type={type}
          autoComplete={id === 'dateOfBirth' ? 'bday' : id}
          aria-label={localize(label)}
          {...register(id, validation)}
          aria-invalid={!!errors[id]}
          className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
          placeholder=" "
          data-testid={id}
          max={id === 'dateOfBirth' ? new Date().toISOString().slice(0, 10) : undefined}
        />
        <label
          htmlFor={id}
          className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
        >
          {localize(label)}
        </label>
      </div>
      {errors[id] && (
        <span role="alert" className="mt-1 text-sm text-red-500">
          {String(errors[id]?.message) ?? ''}
        </span>
      )}
    </div>
  );

  const renderHunField = () => {
    const hunValue = hunRegistration?.hunNumber
      ? hunRegistration.hunNumber
      : isHunLoading
        ? localize('com_auth_hun_loading')
        : localize('com_auth_hun_error');

    return (
      <div className="mb-4">
        <div className="relative">
          <input
            id="hunNumber"
            type="text"
            readOnly
            aria-busy={isHunLoading}
            aria-label={localize('com_auth_hun_number')}
            className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
            placeholder=" "
            data-testid="hunNumber"
            value={hunValue}
          />
          <label
            htmlFor="hunNumber"
            className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4"
          >
            {localize('com_auth_hun_number')}
          </label>
        </div>
        {isHunError && (
          <span role="alert" className="mt-1 text-sm text-red-500">
            {localize('com_auth_hun_error')}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {!startupConfigError && !isFetching && (
        <>
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) => {
              if (!hunRegistration) {
                return;
              }
              registerUser.mutate({
                ...data,
                username: '',
                hunNumber: hunRegistration.hunNumber,
                hunToken: hunRegistration.hunToken,
                token: token ?? undefined,
              });
            })}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 3,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderHunField()}
            {renderInput('dateOfBirth', 'com_auth_dob', 'date', {
              required: localize('com_auth_dob_required'),
              validate: (value: string) => {
                if (!isValidDateOfBirth(value)) {
                  return localize('com_auth_dob_invalid');
                }
                return isAtLeast18(value) || localize('com_auth_under_18');
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  isHunLoading ||
                  isHunError ||
                  !hunRegistration ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className="h-12 w-full rounded-2xl"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={loginPage()}
              aria-label="Login"
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_auth_login')}
            </a>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;
