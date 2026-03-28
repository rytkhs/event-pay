-- Migration to add legal_slug to communities

ALTER TABLE public.communities
    ADD COLUMN legal_slug character varying(255);

UPDATE public.communities
SET legal_slug = public.generate_community_slug();

ALTER TABLE public.communities
    ALTER COLUMN legal_slug SET NOT NULL;

ALTER TABLE public.communities
    ADD CONSTRAINT communities_legal_slug_key UNIQUE (legal_slug);

ALTER TABLE public.communities
    ALTER COLUMN legal_slug SET DEFAULT public.generate_community_slug();
