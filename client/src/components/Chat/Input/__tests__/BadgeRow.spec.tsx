import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import BadgeRow from '../BadgeRow';

jest.mock('~/Providers', () => ({
  BadgeRowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/hooks', () => ({
  useChatBadges: () => [],
}));

jest.mock('@librechat/client', () => ({
  Badge: ({ id }: { id: string }) => <div data-testid={`badge-${id}`} />,
}));

jest.mock('../ToolsDropdown', () => ({
  __esModule: true,
  default: () => <div data-testid="tools-dropdown" />,
}));

jest.mock('../WebSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="web-search" />,
}));

jest.mock('../CodeInterpreter', () => ({
  __esModule: true,
  default: () => <div data-testid="code-interpreter" />,
}));

jest.mock('../FileSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="file-search" />,
}));

jest.mock('../Skills', () => ({
  __esModule: true,
  default: () => <div data-testid="skills" />,
}));

jest.mock('../Artifacts', () => ({
  __esModule: true,
  default: () => <div data-testid="artifacts" />,
}));

jest.mock('../MCPSelect', () => ({
  __esModule: true,
  default: () => <div data-testid="mcp-select" />,
}));

jest.mock('../ToolDialogs', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-dialogs" />,
}));

function renderBadgeRow(showEphemeralBadges: boolean) {
  return render(
    <RecoilRoot>
      <BadgeRow showEphemeralBadges={showEphemeralBadges} onChange={jest.fn()} isInChat={false} />
    </RecoilRoot>,
  );
}

describe('BadgeRow prompt tools visibility', () => {
  it('hides prompt tools and related dialogs when ephemeral badges are disabled', () => {
    renderBadgeRow(false);

    expect(screen.queryByTestId('tools-dropdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('web-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-interpreter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifacts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mcp-select')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-dialogs')).not.toBeInTheDocument();
  });

  it('shows prompt tools and related dialogs when ephemeral badges are enabled', () => {
    renderBadgeRow(true);

    expect(screen.getByTestId('tools-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('web-search')).toBeInTheDocument();
    expect(screen.getByTestId('code-interpreter')).toBeInTheDocument();
    expect(screen.getByTestId('file-search')).toBeInTheDocument();
    expect(screen.getByTestId('skills')).toBeInTheDocument();
    expect(screen.getByTestId('artifacts')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-select')).toBeInTheDocument();
    expect(screen.getByTestId('tool-dialogs')).toBeInTheDocument();
  });
});
