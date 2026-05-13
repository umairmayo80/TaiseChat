import { memo } from 'react';
import { Feather } from 'lucide-react';
import { EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { AssistantIcon } from '@librechat/client';
import { IconProps } from '~/common';
import { cn } from '~/utils';

const taiseFaviconSrc = 'assets/favicon-48x48.png';

type EndpointIcon = {
  icon: React.ReactNode | React.JSX.Element;
  bg?: string;
  name?: string | null;
};

function TaiseModelIcon() {
  return (
    <img
      src={taiseFaviconSrc}
      alt=""
      width="24"
      height="24"
      aria-hidden="true"
      draggable={false}
      className="h-full w-full object-contain"
    />
  );
}

const MessageEndpointIcon: React.FC<IconProps> = (props) => {
  const { error, iconURL = '', endpoint, size = 30, assistantName, agentName } = props;
  const taiseIcon = { icon: <TaiseModelIcon />, name: 'TAISE' };

  const assistantsIcon = {
    icon: iconURL ? (
      <div className="relative flex h-6 w-6 items-center justify-center">
        <div
          title={assistantName}
          style={{
            width: size,
            height: size,
          }}
          className={cn('overflow-hidden rounded-full', props.className ?? '')}
        >
          <img
            className="shadow-stroke h-full w-full object-cover"
            src={iconURL}
            alt={assistantName}
            style={{ height: '80', width: '80' }}
          />
        </div>
      </div>
    ) : (
      <div className="h-6 w-6">
        <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <AssistantIcon className="h-2/3 w-2/3 text-gray-400" />
        </div>
      </div>
    ),
    name: endpoint,
  };

  const agentsIcon = {
    icon: iconURL ? (
      <div className="relative flex h-6 w-6 items-center justify-center">
        <div
          title={agentName}
          style={{
            width: size,
            height: size,
          }}
          className={cn('overflow-hidden rounded-full', props.className ?? '')}
        >
          <img
            className="shadow-stroke h-full w-full object-cover"
            src={iconURL}
            alt={agentName}
            style={{ height: '80', width: '80' }}
          />
        </div>
      </div>
    ) : (
      <div className="h-6 w-6">
        <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <Feather className="h-2/3 w-2/3 text-gray-400" aria-hidden="true" />
        </div>
      </div>
    ),
    name: endpoint,
  };

  const endpointIcons: {
    [key: string]: EndpointIcon | undefined;
  } = {
    [EModelEndpoint.assistants]: assistantsIcon,
    [EModelEndpoint.agents]: agentsIcon,
    [EModelEndpoint.azureAssistants]: assistantsIcon,
    [EModelEndpoint.azureOpenAI]: {
      ...taiseIcon,
    },
    [EModelEndpoint.openAI]: {
      ...taiseIcon,
    },
    [EModelEndpoint.google]: {
      ...taiseIcon,
    },
    [EModelEndpoint.anthropic]: {
      ...taiseIcon,
    },
    [EModelEndpoint.bedrock]: {
      ...taiseIcon,
    },
    [EModelEndpoint.custom]: {
      ...taiseIcon,
    },
    null: { ...taiseIcon },
    default: { ...taiseIcon },
  };

  let { icon, bg, name } =
    endpoint != null && endpoint && endpointIcons[endpoint]
      ? (endpointIcons[endpoint] ?? {})
      : (endpointIcons.default as EndpointIcon);

  if (iconURL && endpointIcons[iconURL]) {
    ({ icon, bg, name } = endpointIcons[iconURL]);
  }

  if (isAssistantsEndpoint(endpoint)) {
    return icon;
  }

  return (
    <div
      title={name ?? ''}
      style={{
        background: bg != null ? bg || 'transparent' : 'transparent',
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-sm text-white',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
          !
        </span>
      )}
    </div>
  );
};

export default memo(MessageEndpointIcon);
