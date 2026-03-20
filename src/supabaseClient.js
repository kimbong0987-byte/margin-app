import { createClient } from '@supabase/supabase-js'

// 1. Supabase 대시보드 (Settings > API)에서 가져온 주소와 키를 여기에 붙여넣습니다.
const supabaseUrl = 'https://zgthffvvjmlbxifetifh.supabase.co' // Project URL
const supabaseAnonKey = 'sb_publishable_XhN7DaRTUjVLvvXVWvitVQ_pMf01TZi' // anon | public Key

// 2. 외부에서 사용할 수 있도록 내보냅니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)