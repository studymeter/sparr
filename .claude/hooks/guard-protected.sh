#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit) — block AI edits to protected paths.
#
# Opt-in & self-managed. Active only when a `.protected.local` file exists
# (gitignored, one path-glob per line) listing files/directories the AI must
# NOT touch. Any Edit/Write to a listed path — and to `.protected.local`
# itself — is blocked. To change what is protected, a human edits
# `.protected.local` by hand; the AI cannot.
#
# A convenience fence, not a security boundary: a human can edit or delete the
# file. For a hard guarantee, use server-side branch protection. Fails OPEN
# (allows) on any internal error so a malformed config never blocks all work.
# exit 2 = BLOCK.
#
# Glob forms (directory-oriented): "dir/" or "dir" (everything beneath),
# "dir/**" (everything beneath), "dir/*" (direct children only), or an exact
# file path.
set -uo pipefail

[ -f .protected.local ] || exit 0   # not configured -> no restriction

raw="$(cat)"
verdict="$(printf '%s' "$raw" | node -e '
  const fs=require("fs"), path=require("path");
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const allow=()=>process.stdout.write("ALLOW");
    const block=(rel)=>process.stdout.write("BLOCK:"+rel);
    let fp="";
    try{ const j=JSON.parse(s); fp=String((j.tool_input&&j.tool_input.file_path)||""); }
    catch(e){ return allow(); }
    if(!fp) return allow();
    const rel=path.relative(process.cwd(), path.resolve(fp));
    if(rel.startsWith("..")) return allow();              // outside the repo
    if(rel===".protected.local") return block(rel);       // the list protects itself
    let globs;
    try{ globs=fs.readFileSync(".protected.local","utf8").split(/\r?\n/)
            .map(l=>l.trim()).filter(l=>l && !l.startsWith("#")); }
    catch(e){ return allow(); }
    const hit=globs.some(g=>{
      const n=g.replace(/\/+$/,"");
      if(n.endsWith("/**")){ const b=n.slice(0,-3); return rel===b || rel.startsWith(b+"/"); }
      if(n.endsWith("/*")){ const b=n.slice(0,-2); if(!rel.startsWith(b+"/")) return false; return !rel.slice(b.length+1).includes("/"); }
      return rel===n || rel.startsWith(n+"/");
    });
    process.stdout.write(hit ? "BLOCK:"+rel : "ALLOW");
  });' 2>/dev/null)"

case "${verdict:-ALLOW}" in
  BLOCK:*)
    echo "🚫 BLOCKED (protected): ${verdict#BLOCK:} is a protected path (.protected.local) and cannot be edited by the AI. To change what is protected, update .protected.local by hand." >&2
    exit 2 ;;
  *) exit 0 ;;
esac
