<script lang="ts">
  import LegalShell from '../LegalShell.svelte';
</script>

<svelte:head>
  <title>Privacy Policy — LaunchUp</title>
  <meta
    name="description"
    content="What LaunchUp collects, how application content is processed, who it is shared with, and your rights over it."
  />
</svelte:head>

<LegalShell
  title="Privacy Policy"
  summary="What we collect, what happens to your application content, and the choices you have over it."
  lastUpdated="2026-09-18"
>
  <h2 id="what-we-collect">What we collect</h2>
  <p>We collect three kinds of information.</p>

  <h3>Account information</h3>
  <p>
    Your first and last name, email address, and role on the platform. Passwords
    are stored only as a salted hash — we never hold the password itself and
    cannot recover it for you.
  </p>

  <h3>Startup and application content</h3>
  <p>
    Everything you submit for assessment: application answers, company and team
    details, traction and regulatory information, and any documents, decks,
    images, or scanned notes you upload. Where you upload a scan or photograph,
    we extract the text from it so it can be assessed. Assume that anything you
    put into an application is read, stored, and processed.
  </p>

  <h3>Technical information</h3>
  <p>
    Server logs recording requests to the platform, including IP address,
    browser user agent, and timestamps, together with records of each assessment
    run — which configuration produced a given score, when, and how long it
    took. We use these for security, debugging, and measuring the quality of our
    own scoring.
  </p>

  <h2 id="how-we-use-it">How we use it</h2>
  <ul>
    <li>To operate your account and authenticate you.</li>
    <li>
      To produce readiness assessments: your application content is analysed
      against our rubrics to assign a level on each scale and identify the
      passages supporting it.
    </li>
    <li>
      To run programmes you are accepted into, which means mentors and programme
      managers assigned to your cohort can see your submissions and assessments.
    </li>
    <li>
      To improve our scoring. We measure our own assessments against reviewer
      judgements to find where the system is wrong. <mark class="lu-todo"
        >[Decision needed: whether customer application content may be used for
        this beyond aggregate accuracy measurement, and whether that requires
        opt-in.]</mark
      >
    </li>
    <li>
      To meet legal obligations and to investigate misuse of the platform.
    </li>
  </ul>
  <p>
    We do not sell your information, and we do not use your application content
    for advertising.
  </p>

  <h2 id="data-sharing-and-third-parties">Data sharing and third parties</h2>
  <p>
    <strong>Automated assessment.</strong> Readiness assessments are generated
    with the help of a third-party large language model provided by Google (the
    Gemini API). To produce an assessment, the relevant parts of your
    application are sent to that service for processing. This is the most
    significant disclosure in this policy: if your submission contains
    information you are not willing to send to an external AI provider, do not
    include it.
    <mark class="lu-todo"
      >[Confirm the contractual terms in place with Google, including whether
      submitted content is excluded from model training, and link them here.]</mark
    >
  </p>
  <p><strong>Others who may receive your information:</strong></p>
  <ul>
    <li>
      <strong>Mentors and programme managers</strong> assigned to your cohort, who
      see your submissions and assessments in order to advise you.
    </li>
    <li>
      <strong>Partner funds and programmes</strong>, but only where you have
      asked us to share your profile with them or have accepted an introduction.
    </li>
    <li>
      <strong>Infrastructure providers</strong> that host our application,
      database, and uploaded files on our behalf, under contracts requiring them
      to process data only on our instructions.
      <mark class="lu-todo"
        >[List providers and hosting regions before publication.]</mark
      >
    </li>
    <li>
      <strong>Authorities</strong>, where we are legally required to disclose,
      or to establish or defend legal claims.
    </li>
  </ul>

  <h2 id="cookies">Cookies</h2>
  <p>
    LaunchUp sets one cookie. After you sign in, an <strong>Access</strong>
    cookie holds your session token. It is <code>httpOnly</code>, so scripts in
    the browser cannot read it, it is restricted to same-site requests, it is
    sent only over HTTPS outside local development, and it expires after about
    five hours or when you sign out.
  </p>
  <p>
    This cookie is strictly necessary to keep you signed in, so it is not
    subject to consent. We set no advertising or cross-site tracking cookies.
    <mark class="lu-todo"
      >[If analytics are added later, this section needs a consent mechanism.]</mark
    >
  </p>

  <h2 id="your-rights">Your rights</h2>
  <p>
    Depending on where you live, you may have the right to access the
    information we hold about you, correct it, delete it, object to or restrict
    how we use it, receive a copy in a portable format, and withdraw consent
    where we relied on it. You can also complain to your local data protection
    authority.
  </p>
  <p>
    You can update your name and email in your account settings and close your
    account at any time. For anything else, write to
    <a href="mailto:privacy@launchup.example">privacy@launchup.example</a> and
    we will respond within
    <mark class="lu-todo"
      >[statutory response period for the chosen jurisdiction]</mark
    >.
  </p>
  <p>
    Because assessments are produced with automated processing, you may ask for
    a human to review a level you believe is wrong rather than accept the
    automated result.
  </p>

  <h2 id="data-retention">Data retention</h2>
  <p>
    We keep account and application data for as long as your account is open.
    When you close it, we delete or anonymise your personal data within
    <mark class="lu-todo">[retention window — commonly 30 to 90 days]</mark>,
    except where we need to keep specific records longer:
  </p>
  <ul>
    <li>
      assessment quality records, which we retain in a form that does not
      identify your startup;
    </li>
    <li>
      security and access logs, kept for <mark class="lu-todo"
        >[log retention period]</mark
      >
      for incident investigation;
    </li>
    <li>
      anything we are required to retain by law, or that is relevant to an
      active legal claim.
    </li>
  </ul>

  <h2 id="contact">Contact</h2>
  <p>
    Privacy questions and rights requests go to
    <a href="mailto:privacy@launchup.example">privacy@launchup.example</a>. Data
    controller identity, postal address, and — if required — a data protection
    officer or representative must be named here before publication.
  </p>
</LegalShell>
