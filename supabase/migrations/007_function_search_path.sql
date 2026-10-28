-- Migracja 007 — stały search_path funkcji triggera
-- =============================================================================
-- Idempotentna (ALTER FUNCTION … SET). Uruchamiaj PO 005: `CREATE OR REPLACE
-- FUNCTION` z 002/005 kasuje ustawienie search_path, więc odwrotna kolejność
-- cofnęłaby tę poprawkę.
--
-- DLACZEGO: funkcja bez ustalonego search_path rozwiązuje nazwy według
-- ścieżki wywołującego — rola, która może tworzyć obiekty w schemacie
-- z wcześniejszą pozycją na ścieżce, mogłaby podstawić własną wersję
-- operatora/funkcji (Supabase advisor `function_search_path_mutable`).
-- `set_updated_at` używa wyłącznie NEW/OLD i `now()` z pg_catalog (zawsze
-- dostępnego), więc pusta ścieżka niczego nie zmienia w działaniu.
-- `popular_tags` dostaje ten sam zapis bezpośrednio w definicji (006).
-- =============================================================================

ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- Weryfikacja: supabase/verify.sql (wiersz 007) lub
--   SELECT proname, proconfig FROM pg_proc WHERE proname IN ('set_updated_at', 'popular_tags');
