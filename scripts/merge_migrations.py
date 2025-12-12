#!/usr/bin/env python3
"""
Merge initial schema and security microfixes into a single migration file.
"""
import re

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def remove_verbose_comments(content):
    """Remove verbose historical comments like '-- Removed: ...' but keep domain explanations"""
    lines = content.split('\n')
    filtered = []
    for line in lines:
        # Skip lines that are purely historical comments
        if line.strip().startswith('-- Removed:') or line.strip().startswith('-- Remove default'):
            continue
        # Skip lines with redundant modification notes (keep domain comments)
        if '-- 修正:' in line and 'refunded' not in line:  # Keep specific domain notes
            continue
        filtered.append(line)
    return '\n'.join(filtered)

def extract_security_additions(microfixes_content):
    """Extract only the additions from security microfixes that aren't in initial schema"""
    # Remove BEGIN/COMMIT
    content = microfixes_content.replace('BEGIN;', '').replace('COMMIT;', '')

    # Extract sections we need to add
    sections = {
        'role_creation': '',
        'revoke_create': '',
        'public_rpcs': '',
        'indexes': '',
        'owner_changes': '',
        'revoke_execute': ''
    }

    lines = content.split('\n')
    current_section = None
    buffer = []

    for i, line in enumerate(lines):
        # Role creation section
        if 'IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = \'app_definer\')' in line:
            current_section = 'role_creation'
            buffer = [line]
        elif current_section == 'role_creation' and ('GRANT USAGE, SELECT ON ALL SEQUENCES' in line or 'ALTER ROLE app_definer' in line):
            buffer.append(line)
            if 'ALTER ROLE app_definer WITH BYPASSRLS' in line:
                sections['role_creation'] = '\n'.join(buffer)
                current_section = None
                buffer = []
        elif current_section == 'role_creation':
            buffer.append(line)

        # REVOKE CREATE section
        if 'REVOKE CREATE ON SCHEMA public FROM PUBLIC' in line:
            sections['revoke_create'] = line

        # REVOKE EXECUTE section
        if 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC' in line:
            current_section = 'revoke_execute'
            buffer = [line]
        elif current_section == 'revoke_execute' and 'GRANT EXECUTE ON FUNCTION public.can_access_event' in line:
            buffer.append(line)
            sections['revoke_execute'] = '\n'.join(buffer)
            current_section = None
            buffer = []
        elif current_section == 'revoke_execute':
            buffer.append(line)

        # Public RPCs section
        if 'CREATE OR REPLACE FUNCTION public.rpc_public_get_event' in line:
            current_section = 'public_rpcs'
            buffer = [line]
        elif current_section == 'public_rpcs' and 'GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account' in line:
            buffer.append(line)
            sections['public_rpcs'] = '\n'.join(buffer)
            current_section = None
            buffer = []
        elif current_section == 'public_rpcs':
            buffer.append(line)

        # Indexes section
        if 'CREATE INDEX IF NOT EXISTS idx_payments_attendance_status' in line:
            current_section = 'indexes'
            buffer = [line]
        elif current_section == 'indexes' and 'CREATE INDEX IF NOT EXISTS idx_settlements_event_created' in line:
            buffer.append(line)
            sections['indexes'] = '\n'.join(buffer)
            current_section = None
            buffer = []
        elif current_section == 'indexes':
            buffer.append(line)

        # Owner changes section
        if 'ALTER FUNCTION public.generate_settlement_report' in line and 'OWNER TO app_definer' in line:
            current_section = 'owner_changes'
            buffer = [line]
        elif current_section == 'owner_changes' and 'ALTER FUNCTION public.rpc_public_get_connect_account' in line:
            buffer.append(line)
            sections['owner_changes'] = '\n'.join(buffer)
            current_section = None
            buffer = []
        elif current_section == 'owner_changes':
            buffer.append(line)

    return sections

def main():
    # Read files
    initial_schema = read_file('/home/tkhs/code/event-pay/supabase/migrations/20251009091140_initial_schema.sql')
    microfixes = read_file('/home/tkhs/code/event-pay/supabase/migrations/20251009140500_security_microfixes.sql')

    # Remove verbose comments from initial schema
    initial_schema = remove_verbose_comments(initial_schema)

    # Extract sections from microfixes
    sections = extract_security_additions(microfixes)

    # Find insertion points in initial schema
    # Insert app_definer role creation and grants right after CREATE EXTENSION
    extension_end = initial_schema.find('CREATE TYPE "public"."actor_type_enum"')

    # Insert REVOKE CREATE right after GRANT USAGE ON SCHEMA public
    grant_usage_idx = initial_schema.find('GRANT USAGE ON SCHEMA "public" TO "postgres";')

    # Build the merged content
    merged = []

    # Part 1: Everything up to CREATE TYPE (includes extensions)
    merged.append(initial_schema[:extension_end])

    # Part 2: Add role creation and security hardening
    merged.append('\n-- Security hardening: app_definer role and schema access control\n')
    merged.append(sections['revoke_create'])
    merged.append('\n\n' + sections['role_creation'])
    merged.append('\n\n')

    # Part 3: Continue with types and functions
    # Find where GRANT section starts (after all CREATE statements)
    grant_section_start = initial_schema.find('GRANT USAGE ON SCHEMA "public" TO "postgres";')

    merged.append(initial_schema[extension_end:grant_section_start])

    # Part 4: Add REVOKE EXECUTE and public RPCs before GRANT section
    merged.append('\n-- Security: Revoke default function execute, add public-safe RPCs\n')
    merged.append(sections['revoke_execute'])
    merged.append('\n\n')
    merged.append(sections['public_rpcs'])
    merged.append('\n\n')

    # Part 5: Add performance indexes
    merged.append('-- Performance indexes\n')
    merged.append(sections['indexes'])
    merged.append('\n\n')

    # Part 6: GRANT section with anon USAGE added
    grant_section_end = initial_schema.find('ALTER DEFAULT PRIVILEGES')
    grant_section = initial_schema[grant_section_start:grant_section_end]

    # Add anon USAGE grant (fix the missing grant)
    grant_section = grant_section.replace(
        'GRANT USAGE ON SCHEMA "public" TO "postgres";\n-- Removed: anon schema USAGE; access via RPC only\nGRANT USAGE ON SCHEMA "public" TO "authenticated";',
        'GRANT USAGE ON SCHEMA "public" TO "postgres";\nGRANT USAGE ON SCHEMA "public" TO "anon";\nGRANT USAGE ON SCHEMA "public" TO "authenticated";'
    )

    # Add GRANT EXECUTE for public RPCs to anon
    rpc_grants = '''

-- Public RPC grants for anon role
GRANT EXECUTE ON FUNCTION public.rpc_public_get_event(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_attending_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_get_attendance() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_check_duplicate_email(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_guest_get_latest_payment(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_public_get_connect_account(uuid, uuid) TO anon, authenticated;
'''

    merged.append(grant_section)
    merged.append(rpc_grants)
    merged.append('\n')

    # Part 7: ALTER DEFAULT PRIVILEGES and rest
    merged.append(initial_schema[grant_section_end:])

    # Part 8: Add owner changes at the end (before final RESET and trigger)
    trigger_idx = merged[-1].find('RESET ALL;')
    before_reset = merged[-1][:trigger_idx]
    after_reset = merged[-1][trigger_idx:]

    merged[-1] = before_reset
    merged.append('\n-- Align SECURITY DEFINER function ownership to app_definer\n')
    merged.append(sections['owner_changes'])

    # Add missing owner changes for functions not in microfixes
    additional_owners = '''
ALTER FUNCTION public.get_event_creator_name(uuid) OWNER TO app_definer;
ALTER FUNCTION public.admin_add_attendance_with_capacity_check(uuid, character varying, character varying, public.attendance_status_enum, character varying, boolean) OWNER TO app_definer;
ALTER FUNCTION public.get_guest_token() OWNER TO app_definer;
ALTER FUNCTION public.hash_guest_token(text) OWNER TO app_definer;
ALTER FUNCTION public.handle_new_user() OWNER TO app_definer;
ALTER FUNCTION public.prevent_payment_status_rollback() OWNER TO app_definer;
ALTER FUNCTION public.update_payment_version() OWNER TO app_definer;
ALTER FUNCTION public.update_revenue_summary(uuid) OWNER TO app_definer;
ALTER FUNCTION public.update_updated_at_column() OWNER TO app_definer;
'''
    merged.append(additional_owners)
    merged.append('\n\n')
    merged.append(after_reset)

    # Write output
    output = ''.join(merged)

    # Final cleanup: remove extra blank lines
    output = re.sub(r'\n{4,}', '\n\n\n', output)

    with open('/home/tkhs/code/event-pay/supabase/migrations/20251009091140_initial_schema.sql', 'w', encoding='utf-8') as f:
        f.write(output)

    print("✓ Merged migration file created successfully")
    print(f"  - Removed verbose comments")
    print(f"  - Added app_definer role with BYPASSRLS")
    print(f"  - Added REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    print(f"  - Added public-safe RPCs with hardened search_path")
    print(f"  - Added performance indexes")
    print(f"  - Added GRANT USAGE ON SCHEMA public TO anon")
    print(f"  - Unified SECURITY DEFINER ownership to app_definer")
    print(f"  - Added GRANT EXECUTE for public RPCs to anon")

if __name__ == '__main__':
    main()
