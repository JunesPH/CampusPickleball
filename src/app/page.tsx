import Link from "next/link";
import { getSubject, isAuthConfigured } from "@/lib/auth0";
import PageShell from "@/components/page-shell";
import CourtIllustration from "@/components/court-illustration";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signedIn = Boolean(await getSubject());
  return (
    <PageShell signedIn={signedIn} overview>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span className={styles.dot} /> Your campus. Your court. Your people.</p>
          <h1 id="hero-title">Your next rally <span>starts here.</span></h1>
          <p className={styles.intro}>Meet university students who want to play. Find pickleball games near campus, connect with players at your level, and make room for a little more court time.</p>
          <div className={styles.actions}>
            <Link href="/games" className={styles.primary}>{signedIn ? "Find a game" : "Browse games"}<span aria-hidden="true">↗</span></Link>
            {signedIn ? <Link href="/games/new" className={styles.secondary}>Create a game</Link> : <a href="/auth/login" className={styles.secondary}>Sign in to play</a>}
          </div>
          <p className={styles.heroNote}>First paddle or favorite sport. You belong here.</p>
          {!isAuthConfigured() && <p role="status" className="mt-6 text-sm text-amber-200">Sign-in is being set up. Please check back soon.</p>}
        </div>
        <div className={styles.artwork}>
          <CourtIllustration />
          <p className={styles.artCaption}><span aria-hidden="true">＋</span> A shared court. A new connection.</p>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <div>
          <p className={styles.eyebrow}>Why we’re here</p>
          <h2 id="why-title">Finding a game shouldn’t<br className={styles.desktopBreak} /> be the hard part.</h2>
        </div>
        <p>Empty courts. Uneven games. The awkward “can I join?” We started with a student’s search for people to play with—and a feeling students on other campuses know, too. This is a place to find your people, whether you’re learning the basics or sharpening your game.</p>
      </section>

      <section className={styles.how} aria-labelledby="how-title">
        <p className={styles.eyebrow}>Less coordinating. More playing.</p>
        <h2 id="how-title">From campus to court in three steps.</h2>
        <ol className={styles.steps}>
          <li><span className={styles.stepNumber} aria-hidden="true">01</span><h3>Create your profile</h3><p>Add your university and self-reported skill level so other students can get to know you as a player.</p></li>
          <li><span className={styles.stepNumber} aria-hidden="true">02</span><h3>Find your group</h3><p>Explore upcoming games by skill level, court, and date. Join a game that suits you, or organize your own.</p></li>
          <li><span className={styles.stepNumber} aria-hidden="true">03</span><h3>Get on the court</h3><p>Meet up, make friends, and improve together. A few good rallies can be the start of a new campus routine.</p></li>
        </ol>
        <p className={styles.courtNote}>Organizing a game does not reserve a court. Check court access and availability before you play.</p>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <div><p className={styles.eyebrow}>See you out there</p><h2 id="closing-title">Good games start with showing up.</h2><p>Your next group of court friends could be one game away.</p></div>
        <Link href="/games" className={styles.primary}>Let’s play<span aria-hidden="true">↗</span></Link>
      </section>
      <footer className={styles.footer}><span>Campus Pickleball</span><span>Made for students. Made for the court.</span></footer>
    </PageShell>
  );
}
