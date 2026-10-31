# Third-party notices and acknowledgments

## Included Automatic DBE processing engine

Automatic DBE 1.6 by Franklin Marek, copyright 2026 Franklin Marek.
Original source: https://www.setiastro.com/pjsr-scripts (AutoDBE.js).
License: Creative Commons Attribution-NonCommercial 4.0 International,
https://creativecommons.org/licenses/by-nc/4.0/ (legal text:
https://creativecommons.org/licenses/by-nc/4.0/legalcode).

The public license permits sharing and adaptation for noncommercial purposes
with attribution and change notices. This package retains the original copyright
and license notices in CCDASTROAutoDBEEngine.jsh. The engine's noncommercial
condition applies to its use; commercial use requires separate author permission.
Other native gradient methods are independent alternatives.

CCDASTRO changes: extracts the processing engine from its GUI/script entry point;
isolates it in a factory with a local parameter reader; includes it at signing time;
adds native-process failure checks, cooperative cancellation and bounded sample
search. Runtime loading or rewriting of installed AutoDBE scripts is not used.
The adapter enforces replacement of its candidate copy and discards model images.
The author and PTeam do not endorse this adaptation. The engine is a fixed copy
and does not automatically inherit updates to the installed vendor script.


## PixInsight libraries

PJSR astrometry includes are PixInsight's secure, separately signed code.
ImageSolverEngine.js is included from the installed PixInsight distribution under
its existing PCL License 2.0 notices; its content is part of this workflow signature.
It is not redistributed here. A change to ImageSolverEngine.js can require the
workflow to be re-signed. No deprecated AdP/ImageSolver.js is used.


Bill Blanshan Star Method V3: the optional finishing operation preserves the attributed PixelMath expression recorded in the user-supplied M42 LRGB Final.xisf processing history. Source image name, iterations and mode are parameterized. No image or external mask from that file is distributed.

## Additional tool and interface credits

The project-level acknowledgment table is in the [README](../README.md#acknowledgments). Native processes are credited to Pleiades Astrophoto / the PixInsight Development Team; the installed ImageSolver library credits Andres del Pozo and Juan Conejero (PTeam). RC Astro tools are by Russell Croman; StarNet2 is by Mikita Misiura / StarNet Software; these native modules are independently installed and are not redistributed in the workflow package.

Bill Blanshan is credited for both the Star Method V2 and V3 PixelMath techniques used by the workflow. The separately distributed Cosmic Photons StarReduction script is not bundled or executed here.

Color & Tone Studio's slider-and-mask interface was inspired by Lighthouse by Neven Krcmarek ([Lighthouse Suite](https://www.lighthousesuite.org/)). Color & Tone Studio is original CCDASTRO code with its own processing math; no Lighthouse source code is included or executed. This acknowledgment does not imply endorsement or affiliation.
## Optional Lighthouse integration

Lighthouse is created by Neven Krčmarek. CCDASTRO can prepare a separate saved copy for the user to open in the separately installed Lighthouse interface. No Lighthouse code or signatures are included in CCDASTRO’s package. Installation, updates and applicable terms are supplied by [Lighthouse Suite](https://www.lighthousesuite.org/).

## BlurlessAI

BlurlessAI is developed by Neven Krcmarek / Lighthouse Suite: https://www.lighthousesuite.org/#blurless. It is separately installed and licensed. This workflow invokes a fresh installed process instance using module defaults; no vendor code, model or license is distributed. Stellar repair only; no process icon is required.
