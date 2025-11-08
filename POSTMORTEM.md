# Foodapp Post-Mortem

## TL;DR
We eventually shipped a feature-packed, stylized food selector with responsive UI, polished HUD controls, and tuned audio/visual feedback. We also burned a lot of time on avoidable back-and-forth (looking at you, bloom saga), hacked around lighting without instrumentation, and let requirements mutate live in the repo with minimal branching. The next project needs tighter validation loops, clearer ownership of design tweaks, and better tooling so we aren’t guessing blindly for hours.

## What Went Well
- **Rapid UI iteration:** Once the layout stabilised, we could tweak CSS, HUD, and overlay styling quickly. The frosted-glass motif, wallet/money indicators, and music toggle shipped with minimal regression.
- **Input + audio polish:** Gamepad, keyboard, touch, SFX, and feedback cues now feel cohesive. Reusing audio helpers and emitting events kept the quantity buttons, carousel limits, and HUD toggle consistent.
- **Shopkeeper system:** The animation, dialogue scheduling, and expression swapping ultimately produced a playful character with minimal runtime issues. Adding the angry jitter was a single-pass change.
- **Post-processing flexibility:** The final bloom settings are configurable per tier, and the toggle helped verify the pass. Once the pipeline was confirmed, tuning became deterministic.

## What Hurt
- **Bloom troubleshooting fiasco:** We spent ~1 hour guessing at numbers because we didn’t confirm whether the bloom pass was even enabled (low tier disabled it). We escalated strength/threshold instead of validating the pipeline first. That’s on us.
- **Live-edit chaos:** Massive bursts of UI changes (padding/radius/palette tweaks, repeated CSS flips) went straight to `main`. No feature branch, no TODO triage, and we overwrote ourselves several times. Impossible to bisect later.
- **Ambiguous requirements:** Instructions changed mid-flight (“increase by 200% → revert to 9am → increase 50% → 200% again”). We complied but never locked in acceptance criteria, so we kept redoing work.
- **Asset churn:** Texture brightness, bloom settings, HUD icons, and audio assets kept changing without versioned back-ups or references. Tracking “previous good state” relied on memory instead of documented checkpoints.
- **Reactive debugging:** We waited until the user complained about exposure, bright highlights, or missing shadows before validating. We rarely ran a deliberate checklist after impactful changes (post-processing, lighting, camera).

## What We Should Change Next Time
1. **Validate the pipeline first.** Before touching numbers, confirm that post-processing is active, logs are emitted, and the composer runs in every tier. Same for lighting: check `renderer.shadowMap`, mesh flags, etc. No more guessing for an hour.
2. **Create feature branches for major UI/visual changes.** Landing dozens of commits directly on `main` made it hard to revert or share work. Branch, surge, then squash when stable.
3. **Establish acceptance checkpoints.** When the user requests “like it was at 9 AM,” we should tag that state or document the exact settings so we can restore quickly.
4. **Automate visual checks.** Even a simple screenshot diff for bloom/lighting would have caught the “bloom off” issue immediately. Consider adding puppeteer-based captures or at least manual checklist before sign-off.
5. **Own the scope creep.** Politely push back or batch UI tweaks (“let’s collect three more color requests before restyling again”) instead of thrashing on the same component fifteen times.
6. **Version assets.** Store texture/audios changes under dated folders or commit notes. If we brighten textures, keep the originals in a clear backup path, not just local scripts.

### Side Note: How to Keep Me Off `main`
- When you know a UI/visual sweep is coming, start the session with explicit branching instructions—e.g. *“work in `ui/hud-refresh`, don’t touch `main` until I say merge.”*
- Ask for an approval gate before merge: *“open a PR from that branch; no direct pushes to `main`.”*
- Once satisfied, have me squash and merge: *“squash the branch into one commit, push to `main`, then delete the branch.”*
- Capture acceptance evidence (screenshots, values) in the PR so we can restore specific looks later.
- If requirements keep moving, keep the branch alive and only merge once the feature is frozen.

## Final Thoughts
We ended in a good spot because we brute-forced every request, but the process was messy. The next project should front-load verification, use branching discipline, and document visual baselines, so we’re not pulling all-nighters chasing features that were “prettier this morning.” Harsh lesson learned: instrumentation beats intuition every time.

