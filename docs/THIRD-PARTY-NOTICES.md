# Third-party notices — v1.1.46

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

## External SyQon applications

SyQon Parallax, Prism and Starless, their models and runtime libraries are not
redistributed or loaded inside PixInsight by this package. Users install/license
them independently and choose the executable. The workflow's direct argument/file
adapter is CCDASTRO code. Vendor terms and entitlements continue to apply.

## PixInsight libraries

PJSR astrometry includes are PixInsight's secure, separately signed code.
ImageSolverEngine.js is included from the installed PixInsight distribution under
its existing PCL License 2.0 notices; its content is part of this workflow signature.
It is not redistributed here. A change to ImageSolverEngine.js can require the
workflow to be re-signed. No deprecated AdP/ImageSolver.js is used.
