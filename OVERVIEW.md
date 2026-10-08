# Project Overview

A musculoskeletal simulator of four resistance-training movements — **squat,
split squat, biceps curl, push-up** — sharing one solver. It ships as a single
self-contained HTML file with no dependencies, built from a set of node-testable
JavaScript modules.

This document is the orientation map: what the thing is, how it is put together,
which modelling decisions were deliberate and why, and what is actually verified.
[README.md](README.md) is the usage and reference doc — controls, export format,
parameter block, full limitations list.

| | |
|---|---|
| Deliverable | `muscle-squat-sim.html`, ~250 KB, zero dependencies |
| Source | 13 model modules + 4 UI modules, ~4,800 lines (~5,600 with the validation suite) |
| Scale | 55 muscles, 16 degrees of freedom, 16 reported structures |
| Movements | squat (28 muscles), split squat (28 × 2 limbs), curl (39), push-up (37) |
| Subject | 75 kg, 1.75 m, de Leva (1996) segment inertias |

---

## 1. The point of it

Three quantities get routinely conflated in discussions of exercise mechanics,
and the simulator's entire job is to keep them apart:

| | what it is | where it comes from |
|---|---|---|
| **Activation** | how hard the muscle is being driven | static optimisation over every actuator |
| **Length** | MTU length change **and** normalised fibre length — two different numbers | moment-arm geometry, then fibre–tendon equilibrium |
| **Loading** | tension in the muscle, compression in the joint | the muscle solution, resolved onto bone axes |

The question it was built to answer: in a deep squat the quadriceps are highly
active *and* the patellofemoral joint is under heavy compression — but the
quadriceps themselves are **lengthened**, not compressed. Those are three facts
about three different things, and the model reports them in three columns.

A second distinction runs through the whole model: a muscle–tendon unit can
lengthen a great deal while its fibres stay near isometric, because the tendon
and aponeurosis take the rest. The quadriceps unit lengthens ~30 % into a full
squat; its fibres lengthen far less. Both numbers are reported, always.

---

## 2. Architecture

```
movement + position (0 … 1)
      │
      ├─ solvePosture ................ movement module        joint angles
      │      balance / reach / closure solved, not prescribed
      │
      ├─ chain.segments .............. movement module        masses, COMs, inertias
      │
      ├─ joint moments ............... 20-dynamics  (open chain, virtual power)
      │                                62-statics   (closed chain, free-body cuts)
      │
      ├─ muscle length ............... 30/32-muscles  L = L_ref − ∫ r(θ) dθ
      │
      ├─ recruitment ................. 50-optimize   bound-constrained QP,
      │                                              active set, in a fixed-point
      │                                              loop over tendon equilibrium
      │
      ├─ fibre state ................. 40-hill       elastic-tendon Hill model
      │
      └─ tendon & joint loads ........ 60-joints
```

### Module responsibilities

| module | responsibility |
|---|---|
| `00-config.js` | subject, anthropometry, the 16 DOFs and their positive senses, per-movement parameters, thigh–calf contact |
| `10-kinematics.js` | body builder; the lower-body planar chain and its balance-solved posture |
| `20-dynamics.js` | **movement-agnostic** inverse dynamics by virtual power, with numerical Jacobians |
| `30-muscles.js` | 28 lower-limb muscles, moment-arm tables, MTU length by virtual work |
| `32-muscles-upper.js` | 27 upper-limb muscles including the full shoulder complex |
| `40-hill.js` | Hill-type muscle with an **elastic** tendon; fibre–tendon equilibrium per muscle per frame |
| `50-optimize.js` | static optimisation: exact active-set QP with a release step, plus the co-activation floor |
| `60-joints.js` | tendon tensions and joint contact loads |
| `62-statics.js` | closed-chain helpers: circle intersection, two-link IK, free-body moments |
| `64/66/68-mov-*.js` | the curl, push-up and split squat movement definitions |
| `70-model.js` | movement registry, per-frame orchestration, the squat expressed as a movement |
| `ui/figure.js` | sagittal figure for all four movements, posture-tracking view window |
| `ui/panels.js` | readouts, the muscle table (one or two limbs), movement-aware interpretation |
| `ui/musclemap.js` | the grouped muscle-chip map and the selected-muscle detail with its sparkline |
| `ui/app.js` | movement tabs, controls, chip selection and sort, animation loop |
| `ui/export.js` | `.xlsx` writer — its own ZIP and SpreadsheetML generators |

### Adding a movement

A movement supplies six things and touches no solver code:

```js
{
  id, chain: { genQ, segments, qOf, kinOf },   // or `statics` for a closed chain
  solvePosture(body, depth, params),
  demands(body, kin, dyn, params),             // required moment per DOF
  dofIds,                                      // which DOFs it constrains
  usesMuscle(m),                               // which muscles it involves
  limbs?, loads?, applyParams?                 // optional
}
```

The squat itself is written in exactly this shape inside `70-model.js`, which is
the check that the abstraction is real rather than retrofitted.

---

## 3. Modelling decisions worth knowing

These are the choices that a reader would otherwise have to reverse-engineer.

**Moment-arm-first geometry.** Rather than placing 3-D origin and insertion
points and wrapping them over surfaces, every muscle carries a *measured* moment
arm `r(θ)` about each DOF it crosses, and its length follows by virtual work,
`L = L_ref − ∫r dθ`. Length and leverage therefore cannot contradict each other,
and both stay inside measured ranges — which hand-placed attachment points in a
planar model do not. The trade-off: these are population-average moment arms,
not a specific subject's anatomy.

**The tendon is elastic, and it has to be.** The vastus lateralis MTU lengthens
11.1 cm (30 %) between standing and a full squat. Its fibres are 12.5 cm at
optimum, so a rigid tendon would drive them to ~1.6 × optimal, off the usable
part of the force–length curve.
Most of that excursion goes into tendon and aponeurosis. The model solves
fibre–tendon equilibrium per muscle per frame and reports MTU length, fibre
length and tendon strain as three separate numbers.

**Postures are solved, not prescribed.** Each movement leaves one variable free
and closes it with a physical constraint, so the output can be checked:

- *Squat* — ankle dorsiflexion is solved so the COM sits over the centre of
  pressure. Trunk lean and required ankle range are therefore **predictions**.
- *Split squat* — with both feet planted, stance length **caps** hip height, so
  the front knee angle is solved from how far the rear leg has folded.
- *Curl* — trunk lean is solved from balance, which is why the model leans back
  under a heavy dumbbell.
- *Push-up* — elbow flexion sets the shoulder-to-wrist distance while the
  shoulder must stay a fixed distance from the toe contact: two circles, one
  intersection, no iteration.

**Open vs closed chains.** The squat and curl are grounded at one end, so virtual
power handles them directly and the moment signs come out already matching the
moment-arm convention. The split squat and push-up have two ground contacts. The
push-up is still determinate — the plank is rigid, so moments about the toes fix
the hand reaction with no assumption. The split squat is genuinely
indeterminate: how much weight goes through each foot is the lifter's choice, so
it is a prescribed, measured quantity exposed as a control.

**The co-activation floor is imposed, not predicted.** Pure effort minimisation
silences every stabiliser. Frontal/transverse muscles and the abdominal wall
carry a floor scaled to joint demand; rows sitting on it are tagged `floor` in
the UI and in the export so they are never mistaken for a result.

**Thigh–calf contact.** Past ~130° of knee flexion the posterior thigh wedges
against the calf, producing a knee *extension* moment the quadriceps no longer
have to. This is what makes a full squat different in kind from a
below-parallel one, and it is modelled as a quadratic contact spring calibrated
to ~0.4 × body weight of contact force.

---

## 4. What the model predicts

Results that came out of the mechanics rather than being put in:

**Squat.** Patellofemoral compression peaks at **3.6 × body weight just below
parallel (~136° knee) and falls to 2.0 × BW at full depth** — deeper is not
monotonically harder on the knee, because thigh–calf contact takes over part of
the demand. The gastrocnemius is strongly shortened and unrecruited at depth
while the soleus is stretched to 1.28 × optimal and **more than half passive**
(220 of its 429 N), which is what lifts the heels when ankle range runs out. Peak
activations occur on the **ascent**, not at the bottom.

**Split squat.** The asymmetry is the movement. At the bottom, iliopsoas reads
**0 % and very short on the front leg, 63 % and near optimal on the rear**;
gluteus maximus 38 % front, 0 % rear; rectus femoris 22 % front, 51 % and
stretched rear.

**Biceps curl.** Pronating the grip costs the biceps about a third of its elbow
leverage and hands the work over: biceps **48 % → 32 %** of the elbow moment,
brachialis **37 % → 48 %**. The part people miss is the shoulder — holding 8 kg
at arm's length needs ~35 N·m of shoulder flexion, and the trunk leans back 14°
to stay balanced, which is what loads the lumbar extensors.

**Push-up.** **75 % of body weight** passes through the hands at the bottom of a
standard push-up; the toes carry the rest and the share moves as the shoulders
travel forward. The plank half is resisted by **hip flexors and abdominals**, not
glutes and erectors, and serratus anterior works hard holding the scapula to the
ribs.

---

## 5. Validation

Nothing here is asserted without a check that can be re-run.

| check | what it proves | current result |
|---|---|---|
| `check-kin.js` | posture vs measured squat kinematics | COM at 55.0 % of stature; predicted 31° DF / 35° lean at 90° knee |
| `check-dyn.js` | joint moments vs published N·m/kg | at 90° knee: ankle −0.28, knee −0.75, hip −0.63, lumbar −1.03 |
| `check-muscles.js` | fibre operating ranges; **passive joint moments vs measurement** | knee, hip, ankle all inside their measured bands |
| `check-solve.js` | moment residuals, recruitment pattern, joint loads | residuals < 0.01 N·m |
| `check-optimality.js` | QP optimality vs an **independent** projected-gradient solver | all four movements optimal at every position |
| `check-statics.js` | the closed-chain statics against virtual power | agreement **0.002 N·m** |
| `check-timeline.js` | dynamic run: peak timing, force–velocity, feasibility | peaks on the ascent; 0 infeasible frames |
| `check-movements.js` | all four end to end | worst residual 0.018 N·m |
| `check-export.js` | workbook builds and opens | verified with `openpyxl` |
| `baseline.js` | squat regression fingerprint | **bit-identical** through two engine generalisations |

The regression fingerprint is the load-bearing one. The engine was generalised
twice — once for multi-movement support, once for the upper limb — and the squat
produced byte-identical output both times, which is how the earlier validation
work stayed valid.

---

## 6. Repository map

```
muscle-squat-sim.html      the deliverable — open this
build.js                   concatenates src + ui into the single file
index.template.html        page shell, prose, documentation panels
README.md                  usage, export format, parameters, full limitations
OVERVIEW.md                this file

src/   00-config  10-kinematics  20-dynamics  30-muscles  32-muscles-upper
       40-hill    50-optimize    60-joints    62-statics
       64-mov-curl  66-mov-pushup  68-mov-lunge  70-model

ui/    figure.js  panels.js  musclemap.js  app.js  export.js  style.css

dev/   check-*.js    validation, run under node
       probe-*.js    diagnostics kept from debugging
       baseline*.js  squat regression fingerprint
```

The modules are written to work both as node CommonJS modules and as plain
browser scripts; `build.js` strips the `require` preamble and inlines them. That
dual form is the whole reason the biomechanics is testable while the deliverable
stays a single file.

---

## 7. Build and run

```bash
node build.js              # rebuild muscle-squat-sim.html
cd dev && node check-movements.js   # end-to-end validation
```

No install step, no package manager, no network access required.

---

## 8. Honest limits

The full list is in [README.md](README.md#limitations). The four that most
affect how the numbers should be read:

1. **Not OpenSim.** Planar, bilaterally symmetric except the split squat,
   moment-arm splines instead of 3-D wrapping surfaces. A teaching instrument,
   not subject-specific analysis.
2. **Synergist splits are unreliable; group totals are not.** Minimising squared
   activation is winner-take-most between muscles doing the same job — the model
   gives hip extension almost entirely to gluteus maximus and near-zero to
   adductor magnus, where EMG shows both working. Aggregate by group.
3. **The shoulder is not a planar joint.** Elbow and shoulder flexion are well
   posed. Rotator-cuff and scapular demands are first-order estimates and the
   scapula has no independent kinematics — it follows the humerus by a fixed
   scapulohumeral rhythm.
4. **Bottom-position activations are a lower bound.** Effort minimisation is
   happy to rest on passive tissue and thigh–calf contact. That is real for a
   relaxed resting squat; a controlled rep carries more. The ascent figures are
   the representative ones.

---

## 9. How it got here

Built in five passes, each driven by a correction worth recording:

1. **Squat** — the original brief: separate activation, length and loading
   across the spine-to-calf chain, with full static optimisation.
2. **Depth was wrong.** The first version topped out at 135° knee flexion, which
   is below parallel but not a deep squat, and it opened on a *half* squat. Fixed
   by extending to a true 155° full squat, adding thigh–calf contact, and naming
   depth by hip-vs-knee height rather than knee angle — because with the shank
   inclined ~35°, a horizontal thigh needs ~125° of knee flexion and "90 degrees"
   is nowhere near parallel.
3. **Three more movements**, which forced the engine to become
   movement-agnostic: an upper limb, closed-chain statics, and independent
   per-limb solving.
4. **Export**, so the solved values leave the page as a real workbook.
5. **The reporting was unreadable.** A long scrolling table meant that while a
   rep played you could watch the figure *or* the numbers, never both — which
   defeats a simulator whose whole subject is what the muscles are doing. The
   table became a grouped map of muscle chips that fits beside the figure on one
   screen, encoding activation, fibre state and relative effort at a glance, with
   a pinned detail panel and a per-muscle sparkline underneath. The page also went
   from dark to white, since the figure and the state colours read better on paper
   tones.
