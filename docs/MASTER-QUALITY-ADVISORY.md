# Input master advisory

Validate and Run display a separate advisory for each input master, including separate L/R/G/B masters. Enabled processing reports retain the advisory in their text and JSON audit. The assessment reads the original input without changing pixels or processing settings. It adds no rejection rules; existing precision and linear-workflow safety checks remain in force.

The current 0–100 score measures sampled **data integrity**, not overall image quality or expected aesthetic quality. It reuses the bounded input screen (up to 4096 samples per nominal channel). Start at 100 and deduct the largest channel penalty: up to 40 points for the sampled fraction at or outside 0–1, 70 for a detected 8-bit grid, or 100 for nonfinite or constant data. No samples gives an unavailable score. These are transparent heuristic penalties, not calibrated probabilities. Bright median intensity alone does not reduce the score or prove prior stretching.

The advisory explains that processing cannot reliably recover clipped signal, missing detail, or lost precision. It lists observed problems and labels confidence as limited. Focus, tracking/star shape, noise, gradients, calibration accuracy and true object SNR are **not measured** in this implementation. Borders and legitimate saturated stars can affect clipping measurements. Undetected localized defects can remain. A score of 100 means no scored problems were found by this screen; it must not be described as an excellent-quality master.

A broader master-quality grade needs independently validated star fitting, background selection and noise measurement, with image-scale and filter context. Until those measurements are available, the interface deliberately identifies the score as data integrity.

Validation: synthetic corrupt, quantized, clipped, blank, bright high-precision and empty inputs; advisory-only preflight behavior; report presentation; complete Node regression suite. Native PixInsight UI execution remains to be verified.
