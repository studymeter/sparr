#!/usr/bin/env bash
# preToolUse (Write|StrReplace) — block AI edits to protected paths (Cursor side).
#
# Opt-in & self-managed via `.protected.local` (gitignored, one path-glob per
# line) listing files/directories the AI must NOT touch. Mirrors
# .claude/hooks/guard-protected.sh but emits Cursor's JSON verdict
# ({"permission":"allow"|"deny"}). The list protects itself. Convenience fence,
# not a security boundary. Fails OPEN on any internal error.
#
# Glob forms: "dir/" or "dir", "dir/**", "dir/*", or an exact file path.
set -uo pipefail

allow(){ echo '{"permission":"allow"}'; exit 0; }

[ -f .protected.local ] || allow

raw="$(cat)"
[ -z "$(printf '%s' "$raw" | tr -d '[:space:]')" ] && allow

printf '%s' "$raw" | node -e '
  const fs=require("fs"), path=require("path");
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const allow=()=>{ console.log(JSON.stringify({permission:"allow"})); process.exit(0); };
    const deny=(rel)=>{ const msg=rel+" is a protected path (.protected.local) and cannot be edited by the AI. Update .protected.local by hand to change what is protected."; console.log(JSON.stringify({permission:"deny", user_message:msg, agent_message:msg})); process.exit(2); };
    let fp="";
    try{ const j=JSON.parse(s); fp=String((j.tool_input&&j.tool_input.file_path)||""); }catch(e){ return allow(); }
    if(!fp) return allow();
    const rel=path.relative(process.cwd(), path.resolve(fp));
    if(rel.startsWith("..")) return allow();
    if(rel===".protected.local") return deny(rel);        // the list protects itself
    let globs;
    try{ globs=fs.readFileSync(".protected.local","utf8").split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")); }catch(e){ return allow(); }
    const hit=globs.some(g=>{
      const n=g.replace(/\/+$/,"");
      if(n.endsWith("/**")){ const b=n.slice(0,-3); return rel===b || rel.startsWith(b+"/"); }
      if(n.endsWith("/*")){ const b=n.slice(0,-2); if(!rel.startsWith(b+"/")) return false; return !rel.slice(b.length+1).includes("/"); }
      return rel===n || rel.startsWith(n+"/");
    });
    if(hit) return deny(rel);
    return allow();
  });'
