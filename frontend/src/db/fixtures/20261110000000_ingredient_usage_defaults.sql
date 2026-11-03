-- Ingredient data cleanup: replace the placeholder "typical usage" of 0-100% on 41 ingredients with real ranges.
--
-- These rows carried default_min_usage = 0 and default_max_usage = 100, which says nothing. The balancer ignores a
-- typical range like that (it only trusts one that is not 0-100 and sits inside the allowed range), so it started
-- them at the middle of the whole allowed range instead of at a sensible amount.
--
-- Each range below is the amount normally used, and lies inside that ingredient's allowed range
-- (min_usage_pct to max_usage_pct), which is left as it is. The one exception to "a typical range" is
-- Distilled Water: water fills whatever is left, so it gets its full allowed range, which behaves the same but no
-- longer looks like a placeholder.
--
-- Only rows that are still 0-100 are changed, so anything you have edited by hand since is left alone,
-- and running this twice changes nothing the second time.

update public.ingredients as i
   set default_min_usage = v.typical_min,
       default_max_usage = v.typical_max
  from (values
    ('3e2e23b8-323d-4305-b315-21e9aa49cdc9', 10, 15),  -- L-Ascorbic Acid
    ('55bbc69e-f41d-4694-af71-a1f6f2a8a19a', 3, 5),  -- Niacinamide USP
    ('067b33df-2bde-4e81-9b33-f1e93b4cf86f', 2, 8),  -- Lactic Acid 80%
    ('578ee98d-925d-45ee-8c08-31beedee3299', 0.5, 2),  -- Salicylic Acid USP
    ('b84a9617-6594-43e6-a56b-34986655cd93', 0.2, 0.5),  -- Allantoin
    ('8720eb2d-1813-464c-9c9c-8073ce672e75', 0.1, 0.5),  -- Vitamin E (Mixed Tocopherols 95%)
    ('8c43a84a-4aa1-4292-bc4b-f10fe2f88a88', 3, 15),  -- Shea Butter (Refined)
    ('b37e89c4-22dc-4706-827c-5a9b2a3af1c2', 5, 30),  -- Fractionated Coconut Oil
    ('64b04b0e-53ca-4683-a39e-a6e9f40a7d94', 2, 20),  -- Jojoba Oil (Cold Pressed)
    ('b5085f05-bb2b-4735-93d9-1237ed26d3d3', 1, 10),  -- Wheat Germ Oil (Refined)
    ('da8e041e-1b14-4c9a-bd9d-97254a1ee974', 2, 10),  -- Rosehip Seed Oil (Cold Pressed)
    ('ba799c2e-b6b5-4277-bec5-10664437e5a3', 2, 8),  -- BTMS-50
    ('5bfcc64b-aecd-4895-b20b-256eac8c8510', 2, 5),  -- Cetearyl Alcohol 30/70
    ('a77a54ad-becb-4776-a4c9-9583d00239c2', 2, 10),  -- Olive Squalane
    ('ff9c44a3-e3b3-47d0-9000-a80f05763ea1', 1, 5),  -- Dimethicone 350
    ('2f5f42e8-65e0-4459-a634-3a2f00f614e7', 2, 10),  -- Anhydrous Lanolin
    ('32877f37-c1dc-446c-a063-a71a9448b20b', 3, 8),  -- Emulsifying Wax NF
    ('eeef8f3c-309a-4a90-add8-fa068584497a', 2, 5),  -- Olivem 1000
    ('308ac19c-a87b-4790-b117-a50ba5f25a23', 0.1, 0.5),  -- Lavender Essential Oil
    ('1569a421-a538-4f77-97e1-56e6e0afcd0b', 0.1, 1),  -- Hyaluronic Acid (High Molecular Weight)
    ('2595ba67-e0e0-42da-ad6f-c111e3af0118', 2, 10),  -- Vegetable Glycerin 99.5%
    ('0f9098c9-2390-4b22-b456-65401454f0af', 10, 50),  -- Aloe Vera Juice (1X)
    ('6bc48252-a1a3-4839-9f41-e732d0bf1550', 1, 5),  -- DL-Panthenol (Pro-Vitamin B5)
    ('4e3b13a0-8257-43df-b7cd-7f0e7ba1d89a', 2, 10),  -- 1,3-Propanediol (Zemea)
    ('c6849374-903a-415f-b0b6-032380ece9a9', 0.5, 1),  -- Euxyl PE 9010
    ('e327aed4-9eea-4842-81ba-8c6181c0bddc', 0.5, 1),  -- Euxyl PE 9010
    ('8ecd26c8-e83a-4005-a595-66f7fadc615f', 0.6, 1),  -- Geogard ECT (Preservative Eco)
    ('9d26c5e2-84cc-4794-b94b-cd0d1d99a3af', 0.2, 0.5),  -- Liquid Germall Plus
    ('5b2dcc9e-3925-45cc-8651-041a0faad94d', 0.1, 0.3),  -- Methylparaben
    ('a3d5cfb4-b587-4fd7-ae7b-2dabc0dbcda8', 0.5, 1.5),  -- HEC
    ('ccb3f53d-3ddf-4cd8-9429-152dce8e3704', 0.2, 0.8),  -- Xanthan Gum Soft
    ('ad90eb63-7bab-4d09-a061-489465e7ce6e', 2, 8),  -- PEG-40 HCO
    ('2530a463-a9df-42ac-a228-bcc84f9109e7', 1, 5),  -- Polysorbate 20 (Tween 20)
    ('2d5b291a-1d35-4cb2-b6be-e24f72097b07', 1, 100),  -- Distilled Water
    ('9e52d27b-2b32-41fb-b9b9-6d82feac6e3b', 5, 15),  -- CAPB (30% Active)
    ('79fd2eae-bed0-4eeb-b9ed-a1c778815e69', 5, 25),  -- SCI (Baby Foam)
    ('415f0fdb-705b-4131-a4bd-6c3bcaf3f9d5', 3, 10),  -- SLS Needles
    ('f38ee4fa-8d23-4d94-b796-e0da92b4491f', 5, 20),  -- Decyl Glucoside
    ('e297d8ee-68d6-4d0d-9181-aa0e5fd2541b', 1, 4),  -- Cetyl Alcohol
    ('7a8f2f85-1abb-4753-b2f7-fb126fc517ae', 0.05, 0.5),  -- Citric Acid Anhydrous
    ('e575acf9-0663-4aad-b8c2-45ed641cdafe', 0.05, 0.5)  -- L-Arginine
  ) as v(id, typical_min, typical_max)
 where i.id = v.id::uuid
   and i.default_min_usage = 0
   and i.default_max_usage = 100
   and v.typical_min >= i.min_usage_pct
   and v.typical_max <= i.max_usage_pct;
