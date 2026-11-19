export const HOME_BY_ROLE = { hr: '/hr', manager: '/manager', employee: '/portal' };

export const ROLE_LABEL = { hr: 'HR', manager: 'Manager', employee: 'Employee' };

export const NAV_BY_ROLE = {
  hr: [
    { to: '/hr', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/hr/observability', label: 'Observability', icon: 'activity' },
  ],
  manager: [{ to: '/manager', label: 'My team', icon: 'users' }],
  employee: [{ to: '/portal', label: 'My onboarding', icon: 'checklist' }],
};
