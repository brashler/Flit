# Third-Party Notices

Flit is MIT-licensed (see LICENSE). Portions of Flit are derived from or
inspired by the following third-party works, whose licenses are retained
here as required.

---

## FLANN — Fast Library for Approximate Nearest Neighbors

**Where:** `src/distances-flann.ts` (ported from FLANN's `algorithms/dist.h`)
**License:** BSD 2-Clause
**Upstream:** https://github.com/flann-lib/flann

Copyright (c) 2008-2011  Marius Muja (mariusm@cs.ubc.ca). All rights reserved.
Copyright (c) 2008-2011  David G. Lowe (lowe@cs.ubc.ca). All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

## libmorton

**Where:** `src/morton.ts` uses the same magic-number bit-interleaving scheme
**License:** MIT
**Upstream:** https://github.com/Forceflow/libmorton

Copyright (c) 2016 Jeroen Baert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Articles & classic techniques

These are public algorithm descriptions, credited for provenance:

- **Octagonal approximate distance** (`src/approx-distance.ts`):
  "Fast Approximate Distance Functions", flipcode,
  https://www.flipcode.com/archives/Fast_Approximate_Distance_Functions.shtml
- **Float bit-flip for radix sort** (`src/bit-utils.ts`):
  Michael Herf, "RadixSort11", http://stereopsis.com/radix.html
- **Z-order / Morton order** (`src/morton.ts`):
  G. M. Morton, "A Computer Oriented Geodetic Data Base; and a New Technique
  in File Sequencing", IBM, 1966; Moser–de Bruijn sequence,
  https://en.wikipedia.org/wiki/Moser%E2%80%93de_Bruijn_sequence
