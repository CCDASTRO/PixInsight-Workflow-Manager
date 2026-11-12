# Input master advisory (v1.9.9)

Validate and Run display advisory assessments for each input master, including separate L/R/G/B masters. Enabled text and JSON processing reports retain the results. Inputs and processing choices are unchanged; there are no new rejection rules. Existing precision and linear-workflow safety checks remain.

## Measurements

The original data-integrity score remains separate: up to 4096 sampled pixels per nominal channel detect clipping, nonfinite/constant data and strong 8-bit quantization grids. The worst channel determines the score. Brightness alone does not reduce it.

The expanded assessment reads nine disjoint interior luminance tiles, each at most 128 × 128 pixels (147456 luminance pixels maximum). Each luminance sample averages up to three nominal channels. Outer integration borders are avoided by this additional sampling, although the original integrity grid still includes them. These are sparse measurements; defects outside the tiles may be missed.

- **Noise:** median tile noise from the MAD of disjoint 2 × 2 mixed-difference residuals, scaled for independent Gaussian noise. Gradients cancel to first order. Correlated/resampled data can underestimate noise; structure can increase the estimate.
- **Stars:** up to 20 isolated local maxima per tile, at least 20 times estimated local noise, excluding saturated/clipped, unresolved, broad/truncated, contaminated or blended candidates. At least 15 accepted stars across three regions are needed for stellar summaries.
- **Sharpness:** median Gaussian-equivalent FWHM in pixels from background-subtracted stellar covariance moments. This is **not a fitted PSF FWHM**, and truncation/thresholding can bias it. Arcseconds are also reported when a valid near-isotropic celestial WCS scale is available. No universal absolute-width penalty is used: image scale, seeing, sampling, equipment and scientific goals differ.
- **Star shape:** median covariance eccentricity and fraction above 0.6. Elongation may reflect tracking, optics or registration; this assessment cannot diagnose the cause.
- **Field consistency:** ratio between median center and outer sampled stellar widths (larger/smaller), when at least three center and nine outer stars are available. Outer tiles are not a complete corner analysis.
- **Stellar contrast:** median accepted stellar peak above local background divided by tile noise. This is a proxy affected by star brightness and selection, **not true object SNR** or a broadband/narrowband-independent sensitivity measure.
- **Background uniformity:** trimmed span of tile medians, in normalized intensity and noise units. More than five noise units raises an advisory. Real nebulosity or galaxy structure can cause this; no score deduction is applied.

## Advisory overall score

The overall 0–100 heuristic is separate from integrity. It needs usable stellar measurements, positive noise and at least five valid tiles. Missing coverage produces an unavailable score rather than assumed perfect quality.

Star shape is 100 minus 160 times eccentricity above 0.35, floored at zero. Stellar contrast maps 20–200 logarithmically to 0–100, clamped. Field consistency, when available, is 100 minus 100 times the ratio above 1.15, floored at zero. The arithmetic mean of available components is capped by the integrity score. Missing field consistency lowers the confidence label. These transparent provisional thresholds have **not been calibrated against an observational reference dataset**. Compare raw measurements and visual inspection; do not treat this as a universal grade across cameras, targets, filters or integration depths.

Reports identify Gaussian-equivalent estimates, missing measurements, confidence and detected limitations. Calibration accuracy and true faint-object signal cannot be established from one master. Processing cannot reliably restore clipped signal, missing detail or lost precision.

## Validation

Synthetic tests cover known round and elongated Gaussian stars, increased noise, broader stars, uneven field widths, gradients, starless/constant data, unavailable scores, bounded sample counts and WCS conversion. Existing integrity and advisory-only preflight tests remain. Native read-only validation is recorded separately when available. No image-processing or signing/release operation is performed by the assessment.
