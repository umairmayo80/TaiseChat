import React from 'react';
import DisplayUsernameMessages from './DisplayUsernameMessages';
import DeleteAccount from './DeleteAccount';
import Avatar from './Avatar';
import EnableTwoFactorItem from './TwoFactorAuthentication';
import BackupCodesItem from './BackupCodesItem';
import { useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

function Account() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <div className="flex items-center justify-between">
          <span>{localize('com_auth_hun_number')}</span>
          <span className="font-mono text-text-secondary">
            {user?.hunNumber || localize('com_auth_hun_not_assigned')}
          </span>
        </div>
      </div>
      <div className="pb-3">
        <DisplayUsernameMessages />
      </div>
      <div className="pb-3">
        <Avatar />
      </div>
      {user?.provider === 'local' && (
        <>
          <div className="pb-3">
            <EnableTwoFactorItem />
          </div>
          {user?.twoFactorEnabled && (
            <div className="pb-3">
              <BackupCodesItem />
            </div>
          )}
        </>
      )}
      {startupConfig?.allowAccountDeletion !== false && (
        <div className="pb-3">
          <DeleteAccount />
        </div>
      )}
    </div>
  );
}

export default React.memo(Account);
