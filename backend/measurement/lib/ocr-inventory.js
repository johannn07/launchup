/**
 * The handwriting corpus: 10 photographed pages, 2 writers, 5 each.
 *
 * `sections` is the page's own headings, verbatim and in page order. It is an
 * objective transcription of the document's structure — not a judgement — and
 * it is what span selection draws from.
 *
 * `fields` is the judgement: for each of the eight fields the extraction prompt
 * demands, does the page carry a section that supplies it? This is stage 1's
 * ground truth, so it is adjudicated by a human and recorded here rather than
 * derived at runtime.
 *
 * Why the negatives exist at all: the prompt orders the model to invent every
 * field it cannot find ("If not explicitly written, infer...", "NEVER leave any
 * field as an empty string"). Invention is instructed, not accidental, so a
 * grounded/invented split is exactly what SUPPORT_THRESHOLD has to separate.
 */

/** The eight fields, in the order the extraction prompt lists them. */
const FIELDS = [
  'title',
  'startup_description',
  'problem_statement',
  'target_market',
  'solution_description',
  'objectives',
  'scope',
  'methodology',
];

/**
 * Writer A wrote in a white spiral notebook with a PAGE/DATE header and
 * numbered each proposal; every page shows bleed-through from its reverse.
 * Writer B used a yellow legal pad and varied the section schema per document.
 *
 * Assignment is by paper, hand and numbering — confirmed by John, not inferred
 * by the harness.
 */
const WRITER_A = 'A';
const WRITER_B = 'B';

const DOCUMENTS = [
  {
    file: 'Agritrack.jpg',
    writer: WRITER_A,
    projectName: 'AgriTrack',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'Mediqueue.jpg',
    writer: WRITER_A,
    projectName: 'MediQueue',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'Sakayscan.jpg',
    writer: WRITER_A,
    projectName: 'SakayScan',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'BalikBasura.jpg',
    writer: WRITER_A,
    projectName: 'Balik Basura',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'EskwelaKo.jpg',
    writer: WRITER_A,
    projectName: 'Eskwela Ko',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'Anilink.jpg',
    writer: WRITER_B,
    projectName: 'AniLink',
    sections: [
      'I. General Information',
      'II. Problem',
      'III. Solution',
      'IV. Target Market',
      'V. Objectives',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      methodology: false,
    },
  },
  {
    file: 'AquaSense.jpg',
    writer: WRITER_B,
    projectName: 'AquaSense',
    sections: [
      'A. Project Metadata',
      'B. Problem Statement',
      'C. Technical Proposal',
      'D. Beneficiary Group',
      'E. Project Milestones',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      // CONTESTED: "C. Technical Proposal" states the mechanism (buoys,
      // LoRaWAN, SMS alarms). Adjudicated as method, so true.
      methodology: true,
    },
  },
  {
    file: 'BarangayPass.jpg',
    writer: WRITER_B,
    projectName: 'Barangay Pass',
    sections: [
      'Metadata table (Field Name / Data Input)',
      'Problem Summary',
      'Proposed System Workflow',
      'Target Users',
      'Expected Outcomes',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      // CONTESTED: "Proposed System Workflow" is a numbered 3-step procedure,
      // which is method. It doubles as solution_description.
      methodology: true,
    },
  },
  {
    // Filename says GoldChain; the page says "ColdChain Guard". Recorded
    // because the mismatch will otherwise read as a transcription error.
    file: 'GoldChain.jpg',
    writer: WRITER_B,
    projectName: 'ColdChain Guard',
    sections: [
      '1. Overview',
      '2. Context & Problem',
      '3. Proposed Solution',
      '4. Pilot Scope',
      '5. Performance Indicators',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      // The only explicit scope section in the corpus.
      scope: true,
      methodology: false,
    },
  },
  {
    file: 'RxScan.jpg',
    writer: WRITER_B,
    projectName: 'RxScan',
    sections: [
      'Metadata header (Project Identifier / Title / Applicant / Capital / Timeline)',
      '1.) Operational Deficit',
      '2.) System Architecture',
      '3. Target Deployment',
      '4. Quantifiable Targets',
    ],
    fields: {
      title: true,
      startup_description: false,
      problem_statement: true,
      target_market: true,
      solution_description: true,
      objectives: true,
      scope: false,
      // CONTESTED: "2.) System Architecture" describes how the system works.
      methodology: true,
    },
  },
];

/** Fields whose adjudication was a judgement call, kept visible for the report. */
const CONTESTED = [
  { file: 'AquaSense.jpg', field: 'methodology', because: 'C. Technical Proposal states the mechanism' },
  { file: 'BarangayPass.jpg', field: 'methodology', because: 'Proposed System Workflow is a numbered procedure' },
  { file: 'RxScan.jpg', field: 'methodology', because: 'System Architecture describes how it works' },
];

module.exports = { FIELDS, DOCUMENTS, CONTESTED, WRITER_A, WRITER_B };
