# 1.9.6 signing and package preparation

The user supplied the final main-script signature, timestamp
2026-11-11T02:10:10.289Z, after the main source and advanced include modifications.
The source reports version 1.9.6. See PREVIEW-ACCEPTANCE-1.9.6.md for audit scope
and regression coverage; native interactive validation remains pending.

The package has been built. All four packaged files match their local source and
signature bytes. SHA-1: `ca3aba4e97f2d6c9f535e0082240495534f59c8a`.
The user supplied the signed `updates/updates.xri`, timestamp 2026-11-11T02:10:53.936Z. Structural and byte
checks do not independently verify cryptographic signatures.

The previous manifest is preserved in the workspace's
`output/pi-before-1.9.6-manifest`. Historical packages were preserved.
Release prepared for the user-authorized GitHub publication. Native cryptographic verification is not claimed. Do not rebuild after signing the manifest.
