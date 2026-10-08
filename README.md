# Muscle Simulator

A biomechanical simulator of four movements — **squat, split squat, biceps
curl, push-up** — on one engine, keeping three things that are routinely
conflated strictly apart:

| | what it is | where it comes from |
|---|---|---|
| **Activation** | how hard the muscle is being driven | static optimisation over all 28 actuators |
| **Length** | MTU length change *and* normalised fibre length | moment-arm geometry, then fibre–tendon equilibrium |
| **Loading** | tension in the muscle, compression in the joint | the muscle solution, resolved onto bone axes |

The deep-squat question this was built for: the quadriceps are highly active and
the patellofemoral joint is under heavy compression, but the quadriceps
themselves are *lengthened*, not compressed. All three read separately here.

**Depth is named by the hip, not the knee.** With the shank inclined ~35°, a
horizontal thigh needs about 125° of knee flexion — so "90 degrees" is a *half
squat* with the hip still 22 cm above the knee. Depth 1.0 here is a true full
squat: 155° knee flexion, hip 22 cm *below* the knee, hamstring on calf.

55 muscles (28 lower limb, 27 upper), 16 degrees of freedom. Each movement
loads the subset it actually uses.

## Open it

Open `muscle-squat-sim.html` in any browser. One file, no dependencies, no build
step needed to *use* it. Pick a movement from the tab strip.

## The four movements

| | chain | what it is for |
|---|---|---|
| **Squat** | open, grounded at the feet | depth vs knee load; thigh–calf contact |
| **Split squat** | closed, two feet, **two limbs solved independently** | front/rear asymmetry |
| **Biceps curl** | open, grounded at the feet, articulated arm | grip changes who does the work |
| **Push-up** | closed, hands + toes | how much load actually goes through the hands |

**Split squat** is the only asymmetric one. Front and rear leg get independent
postures, demands and muscle solutions, because they are doing different jobs:
at the bottom the front leg's iliopsoas is short and silent while the rear leg's
runs at ~60 % and its rectus femoris is stretched. That contrast is the movement.
Both feet are planted throughout (static split squat, no stepping phase), which
means **stance length caps how high the hips can be** — a longer stance starts
you lower and shifts work between knee and hip.

**Biceps curl** shows two things people miss. Pronating the grip costs the biceps
about a third of its elbow leverage and hands the work to brachialis and
brachioradialis (biceps 48 % → 32 % of the elbow moment). And the shoulder is
holding the weight out in front — at 8 kg that is ~30 N·m of shoulder flexion —
so the trunk leans back to stay balanced, which is what loads the lumbar
extensors. Trunk lean is solved, not prescribed.

**Push-up** is a closed chain that is still determinate: the plank is rigid, so
moments about the toes fix the hand reaction with no assumption. About 75 % of
body weight goes through the hands at the bottom of a standard push-up — the
toes carry the rest, and the share moves as the shoulders travel forward. The
plank half is resisted by **hip flexors and abdominals**, not glutes and
erectors, and the serratus anterior works hard holding the scapula to the ribs.

## Controls

- **Depth slider** — quasi-static. What the body needs to hold that exact depth
  still. Landmarks: ~58 % is a half squat (90° knee), ~82 % is parallel (127°
  knee, hip level with knee), 100 % is full depth (155° knee).
- **Play** — the full descent / hold / ascent with inertial terms and force–velocity.
  Worth running: activations peak on the way **up**, not at the bottom.
- **Tempo** — scales the 2.0 s / 0.6 s / 1.8 s default.
- Hover a muscle chip to isolate it in the figure; click to pin it.
  Arrow keys nudge depth, space plays/pauses.

## The muscle map

The panel beside the figure is the main readout, and it is sized to stay on
screen while a rep plays — the whole point is to watch the figure and the
muscles at the same time.

Every muscle the movement uses is one chip, grouped by region (spine & trunk,
hip & pelvis, thigh, lower leg, and for the upper-limb movements shoulder,
scapula and arm). Each chip carries four encodings at once:

| encoding | meaning |
|---|---|
| number | activation, % of maximum |
| bar length | the same activation |
| bar colour | fibre state — blue lengthening, green near optimal, red shortening |
| chip tint | how hard that muscle is working relative to the rest |
| trailing dot | the demand about that axis is a frontal/transverse estimate |

Muscles under 3 % fade back so the working ones stand out. The group header
shows the region's mean activation, which is the number to read when synergists
trade off against each other — the squared-activation cost is winner-take-most,
so an individual split is less trustworthy than its group total.

In the split squat each chip shows **two** bars, front leg then rear, because
that is the movement where the two legs genuinely disagree: at 70 % depth
gluteus maximus reads 36 % front / 0 % rear.

Click a chip to pin it. The panel underneath then shows that muscle's
activation, fibre length and tendon tension, a sentence on what its
musculotendon unit is doing, and a sparkline of activation and fibre length
across the whole range of the movement with a marker at where you are now.

`by region` / `most active` re-sorts the chips. Sorting by activation is the
fast way to answer "what is actually driving this position".

## Export

The **Export** card writes the solved model out, not a screenshot of the
current frame. It sweeps the whole position range and gives you:

| sheet | one row per |
|---|---|
| `<Movement> positions` | position — joint angles, required moments, GRF, COP, residuals |
| `<Movement> muscles` | position × limb × muscle — the long table you actually analyse |
| `<Movement> structures` | position × structure — tendon tensions and joint contact loads |
| `Muscle properties` | muscle — Fmax, optimal fibre length, tendon slack, pennation, moment-arm ranges |
| `Summary` | subject, parameters, and the limitations, so the file is self-documenting |

The muscle sheet keeps the three variables in separate columns — activation,
*both* length measures (MTU change and normalised fibre length), and force split
active/passive — so a pivot table can ask "which muscles are highly active while
lengthening?" directly.

Options: this movement or all four, 21 / 51 / 101 positions, and optionally a
`timed rep` sheet carrying the dynamic run (with inertia and force–velocity)
against time rather than position.

**`.xlsx` is a real workbook**, not a renamed CSV: typed numbers, bold headers,
multiple sheets. Since the simulator has no dependencies, `ui/export.js`
contains a small ZIP writer and a minimal SpreadsheetML generator. Entries are
DEFLATE-compressed through the platform's `CompressionStream` (about 8:1 —
all four movements at 51 positions is ~1.3 MB rather than ~10 MB); where that
API is missing it falls back to stored entries, which Excel still opens. The
`.csv` button gives the muscle table on its own, UTF-8 with a BOM so Excel
reads the units correctly.

Verify it with `node dev/check-export.js all 51`, which builds the workbook
headlessly and writes it to `dev/` for opening in a spreadsheet application.

## The chain

```
movement + position
   -> joint angles            movement.solvePosture
   -> segment configuration   movement.chain.segments
   -> external joint moments  20-dynamics (virtual power) or 62-statics
   -> muscle demand           50-optimize.js     static optimisation
   -> muscle length / state   30/32-muscles + 40-hill
   -> tendon and joint loads  60-joints.js
```

A movement supplies a kinematic chain, a posture solver, a demand function, the
DOFs it constrains, and which muscles it involves. Everything else is shared —
adding a movement does not touch the solver. Movement modules are
`src/64-mov-curl.js`, `66-mov-pushup.js`, `68-mov-lunge.js`; the squat is
expressed in the same shape inside `70-model.js`.

**Posture.** Knee flexion is the depth driver; hip flexion, lumbar flexion and
arm elevation follow measured squat kinematics. Ankle dorsiflexion is *solved*
so the whole-body COM sits over the prescribed centre of pressure — so trunk
lean and required ankle range are model outputs, not inputs. They can therefore
be checked: at 90° knee flexion the model predicts 31° dorsiflexion and 35°
trunk lean; peak dorsiflexion demand is 38° just below parallel; at full depth
the hip sits at 20.5 cm, COM at 55 % of stature standing.

**Thigh–calf contact.** Past ~130° of knee flexion the posterior thigh wedges
against the calf. The contact force acts well behind the knee, so it produces a
knee *extension* moment the quadriceps no longer have to. This is what makes a
full squat different in kind from a below-parallel one, and the model shows the
consequence: **patellofemoral compression peaks at 3.6 ×BW around parallel and
falls to ~2.0 ×BW at full depth.** Peak knee loading is at parallel, not at the
bottom. Modelled as a quadratic contact spring calibrated to ~0.4 ×BW of contact
force at full depth; reported as its own row, never folded silently into the
muscle solution.

**Moments.** The planar chain is parameterised by exactly the joint angles we
want moments about, so d'Alembert's principle gives each joint moment directly
as `Σ m(a − g)·∂r/∂q`, with Jacobians by central difference. No Newton–Euler
recursion, and no sign bookkeeping: τ comes out already in the positive sense of
each DOF, matching the moment-arm convention.

**Muscle geometry is moment-arm-first.** Each muscle carries a measured moment
arm `r(θ)` about every DOF it crosses; length follows by virtual work,
`L = L_ref − ∫r dθ`. Length and leverage therefore cannot contradict each other,
and both stay in measured ranges — which hand-placed attachment points in a
planar model do not.

**Muscle model.** Hill-type with an *elastic* tendon. This matters: the
quadriceps MTU lengthens ~27 % into a deep squat, far more than short vastus
fibres could absorb. Most of it goes into tendon and aponeurosis, and the model
reports MTU length, fibre length and tendon strain as three separate numbers.

**Recruitment.** Force is linear in activation at a fixed fibre state, so each
frame is a bound-constrained QP, solved exactly by an active-set method (with
the release step — without it the solver returns feasible-but-suboptimal
corners), wrapped in a fixed-point loop over tendon equilibrium.

## Rebuilding

Source lives as numbered modules so the biomechanics stay testable under node;
`build.js` concatenates them into the single HTML file.

```bash
node build.js
```

The modules work both as node CommonJS modules and as plain browser scripts.

## Validation

```bash
cd dev
node check-kin.js          # posture, COM height, predicted ankle ROM and trunk lean
node check-dyn.js          # joint moments in N.m/kg vs published squat data
node check-muscles.js      # fibre operating ranges; passive joint moments vs measurement
node check-solve.js        # moment residuals, recruitment pattern, joint loads
node check-optimality.js   # QP optimality against an independent projected-gradient solver
node check-timeline.js     # dynamic run: peak timing, force-velocity, feasibility
node check-movements.js   # all four: residuals, fibre ranges, headline mechanics
node check-statics.js     # the split squat's bottom-up statics vs virtual power
node baseline.js          # squat fingerprint, for regression after engine changes
node check-export.js all 51   # builds the workbook headlessly and writes it to dev/
```

Current state: joint moments at 90° knee flexion are ankle −0.28, knee −0.75,
hip −0.63, lumbar −1.03 N·m/kg; patellofemoral peaks at 3.6 ×BW and
tibiofemoral at 3.0 ×BW around parallel, both falling by full depth; all 28
fibre operating lengths inside 0.45–1.55; passive joint moments inside their
measured bands; moment residuals below 0.004 N·m; every frame feasible.

In the dynamic run, vastus lateralis reads 54 % descending, drops to 17 % at the
bottom where passive tissue and thigh–calf contact carry the load, then spikes
to **73 % at 91 % depth on the ascent** — the sticking point, right where the
passive support runs out.

`check-optimality.js` now covers all four movements. `check-statics.js` proves
the split squat's per-leg inverse dynamics by reproducing the squat's
virtual-power moments with it (agreement 0.002 N·m). `baseline.js` /
`baseline-squat.json` is a regression fingerprint — the squat was verified
bit-identical after the engine was generalised for the new movements.

`dev/probe-*.js` are diagnostic scripts kept from debugging — they check the
Jacobian against an analytic rigid rotation, dump the QP, and test whether a
given muscle's activation is genuinely optimal.

## Changing the fixed parameters

The controls are deliberately limited to depth and tempo. Everything else is a
constant in `src/00-config.js`:

- `SUBJECT` — mass, height, and `extraLoad` / `loadPosition` for a barbell
  (setting a back-bar load also pins the arms, which changes the balance solve)
- `SEG_LEN_FRAC`, `SEG_INERTIA` — anthropometry
- `MOVEMENT` — maximum depth (`kneeFlexMax`), the hip–knee coupling, lumbar
  flexion, arm elevation, available ankle dorsiflexion, COP trajectory, tempo
- `THIGH_CALF` — contact onset angle, stiffness, and `bulkScale`
- `FRONTAL` — stance width and the out-of-plane moment estimates

## Limitations

Read these before trusting a number. They are also shown in the page itself.

- **Not OpenSim.** Planar, bilaterally symmetric, moment-arm splines instead of
  3-D paths and wrapping surfaces. A teaching instrument, not a subject-specific
  analysis.
- **Synergist splits are unreliable; group totals are better.** Minimising
  squared activation is winner-take-most between muscles doing the same job. The
  model gives hip extension almost entirely to gluteus maximus and near-zero to
  adductor magnus, whereas EMG shows both working.
- **Out-of-plane demands are estimates** from stance geometry, not measurement.
  Muscles acting mainly about those DOFs are tagged in the table. The deep hip
  external rotators are outside the requested muscle set, so hip rotation demand
  is kept deliberately conservative.
- **Stabiliser activation is partly imposed.** Pure effort minimisation silences
  every stabiliser, so frontal/transverse muscles and the abdominal wall carry a
  co-activation floor scaled to joint demand. Rows sitting on it are tagged
  `floor` and are not predictions.
- **Passive properties are calibrated, not measured** — per-muscle passive fibre
  strain was set so predicted passive joint moments match measured end-range
  values. Lumbar passive moment reads low because ligament and disc
  contributions are not modelled.
- **Thigh–calf contact is a modelled estimate**, calibrated to a reported
  contact force range, not measured for this subject. It depends strongly on
  thigh and calf bulk — `THIGH_CALF.bulkScale` in `src/00-config.js`.
- **Bottom-position activations are a lower bound.** Effort minimisation is
  happy to rest on passive tissue and thigh–calf contact, so quadriceps and
  glute activity read very low at the very bottom. That is real for a relaxed
  resting squat; a controlled rep carries more. The ascent figures are the more
  representative ones.
- **Joint contact forces are estimates**, apart from the patellofemoral force,
  which uses the well-supported `F = F_quad · k(θ)` relation.
- **The shoulder is not a planar joint.** Elbow and shoulder flexion are well
  posed. Rotator cuff and scapular muscles act about DOFs whose demands here are
  first-order estimates, and the scapula has no independent kinematics — it is
  driven from the humerus by a fixed scapulohumeral rhythm. Read those as group
  behaviour, not as a reliable split between individual muscles.
- **The split squat's front/rear load share is prescribed**, not derived — a
  closed chain cannot determine it. It is exposed as a control.
- **Biceps femoris reaches 0.41 × optimal fibre length** on the rear leg of a
  deep split squat, below the plausible band. It is unrecruited there (hip near
  neutral, knee deeply flexed leaves it slack), so it does not affect the
  solution, but the displayed length is at the edge of the model's validity.
