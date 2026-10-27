# Artwork delivery investigation — 2026-10-26

Production catalogue artwork was valid but served original PNGs. Remote artwork required a backend S3 HEAD request followed by a signed redirect, and the final response had no explicit Cache-Control. The legacy local poster also served its original PNG.

Measured before deployment (same client, three requests in parallel):

| Artwork | Bytes | Seconds | Redirects |
| --- | ---: | ---: | ---: |
| Achebe poster | 2887097 | 5.214 | 1 |
| Achebe backdrop | 2373139 | 4.717 | 1 |
| Crew poster | 2479018 | 2.060 | 0 |

Change: stable existing image URLs serve progressive JPEG display derivatives, maximum 640 px poster width / 1600 px other artwork width, preserving aspect ratio and original files. Persistent disk cache, atomic writes, concurrent-request deduplication, maximum four concurrent conversions, 20 MiB input and 40 MP decode limits. Browser/client caching lasts 24 hours with ETag revalidation. Conversion failure retains original delivery. Studio upload verification prepares derivatives before attachment/publication when possible. Video authorization and delivery are unchanged.

Validation: backend build passed; 68 tests across media service, HTTP media controller, and admin service passed. HTTP tests cover concurrent cache misses, cache reuse and 304, original preservation, dimensions/content type, missing-image recovery and protected-video/path traversal denial. Optimized poster and backdrop visually inspected locally.

Production deployment: c03d0323-c151-4fbf-ba12-0a82fc391d15. SUCCESS; production health reports ok and database up.

After cache preparation, the same parallel requests returned HTTP 200 image/jpeg with no redirects:

| Artwork | Bytes | Seconds | Reduction in bytes |
| --- | ---: | ---: | ---: |
| Achebe poster | 124616 | 0.942 | 95.7% |
| Achebe backdrop | 161530 | 1.331 | 93.2% |
| Crew poster | 62063 | 0.850 | 97.5% |

First cache-generating requests took 2.591, 2.417 and 1.438 seconds respectively. All three live responses carry public, max-age=86400 and ETags. Conditional request verified 304. These are endpoint download measurements on this network, not a guarantee for every device. iPhone simulator Home visibly renders both New Listings posters and the Achebe hero (ios-home.png); no new iOS binary is required. Original uploads remain intact. No physical-device timing or Android runtime test performed.

