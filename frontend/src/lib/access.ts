const startupModule = {
  name: 'Startups',
  link: 'startups',
  hideSubmodule: true,
  subModule: [
    {
      name: 'Assessment',
      link: 'assessment',
      subModule: []
    },
    {
      name: 'Readiness',
      link: 'readiness-level',
      subModule: []
    },
    {
      name: 'RNA',
      link: 'rna',
      subModule: []
    },
    {
      name: 'RNS',
      link: 'rns',
      subModule: []
    },
    {
      name: 'Initiatives',
      link: 'initiatives',
      subModule: []
    },
    {
      name: 'Roadblocks',
      link: 'roadblocks',
      subModule: []
    },
    // {
    //   name: 'Progress',
    //   link: 'progress-report',
    //   subModule: []
    // },
    {
      name: 'Overview',
      link: 'overview',
      subModule: [
        {
          name: 'General',
          link: 'general'
        },
        {
          name: 'Members',
          link: 'members'
        },
        {
          name: 'Capsule Proposal',
          link: 'capsule_proposal'
        },
        {
          name: 'Elevate',
          link: 'elevate'
        }
      ]
    }
  ]
};

const settingsModule = {
  name: 'Account',
  link: 'account',
  hideSubmodule: true,
  subModule: [
    {
      name: 'Profile',
      link: 'profile',
      subModule: []
    },
    {
      name: 'Appearance',
      link: 'appearance',
      subModule: []
    }
    // {
    // 	name: 'Change Password',
    // 	link: 'password'
    // }
  ]
};

export const access = {
  roles: {
    Startup: {
      modules: [startupModule, settingsModule]
    },
    Mentor: {
      modules: [startupModule, settingsModule]
    },
    Manager: {
      modules: [
        startupModule,
        {
          name: 'Applications',
          link: 'applications',
          subModule: []
        },
        {
          name: 'Admin',
          link: 'admin',
          subModule: [
            { name: 'Dashboard', link: '', subModule: [] },
            { name: 'Users', link: 'users', subModule: [] },
            { name: 'Startups', link: 'startups', subModule: [] },
            { name: 'Assessments', link: 'assessments', subModule: [] },
            { name: 'Tiers', link: 'tiers', subModule: [] },
            { name: 'OCR', link: 'ocr-documents', subModule: [] },
            { name: 'AI Bias', link: 'ai/bias-audits', subModule: [] }
          ]
        },
        // {
        //   name: 'Analytics',
        //   link: 'analytics',
        //   subModule: []
        // },
        // {
        // 	name: 'Cohorts',
        // 	link: 'cohorts',
        // 	subModule: []
        // },
        settingsModule
      ]
    }
  }
};
