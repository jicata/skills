<!-- TEMPLATE — instantiated by /setup ONLY when interview Q2 surfaces it: the path from
     merged code to a running system leaves this repo (GitOps repos, gateways, IaC).
     Materialize as `.claude/rules/deploy-infra-foundation.md` (always-on). Fill every
     <FILL: …> slot; the donor pipeline stays as a worked example — replace its details with
     yours but keep the shape as reference if it matches; delete this comment. -->

# 🚢 Deploy Infra Foundation — deployment lives OUTSIDE this repo

**Priority:** High

Sibling to the chassis-foundation pattern: just as a chassis owns runtime behavior you can't see from the app repo, **<FILL: N> infrastructure repos own everything between "<FILL: what this repo's CI actually produces, e.g. image in a registry>" and "<FILL: what running means here, e.g. pods serving traffic>"**. You cannot reason correctly about deployment, environments, gateway routing, or cloud resources from the app repo alone.

## The path to production (how code actually ships)

<!-- Draw the REAL pipeline as an indented arrow diagram: what in-repo CI produces, where the
     artifact lands, what external event/PR/sync turns it into a running system, and who
     approves each hop. Then state the negative space: what NEVER happens (e.g. "no pipeline
     ever touches the cluster directly"). -->

```
<FILL: pipeline diagram>
```

<FILL: one paragraph — the invariant of the model, e.g. "in-repo CI produces an artifact; the only path to a running system is X". Name any in-repo step that LOOKS like a deploy but isn't (the donor had helm steps that only targeted a sandbox).>

> **EXAMPLE (donor: the donor stack) — the worked pipeline this template generalizes:**
> ```
> app repo CI (GitHub Actions)
>   └─ release-please cuts release → docker build → push image to Artifactory
>   └─ composite deploy job (devops-tools deploy.yml)
>        └─ raises a PR against the org's platform-gitops repo bumping the kustomize image-patch tag
>             └─ PR approved+merged → ArgoCD detects the change → syncs → deployment happens
> ```
> **No pipeline ever touches the cluster directly.** CI ends at the artifact registry; the *only* path to a running pod is the image-tag PR in the GitOps repo that ArgoCD watches. The `helm upgrade` steps in the release workflows target a sandbox cluster only.

## Where the infra repos live

| Repo | Local path | Owns |
|---|---|---|
| <FILL: repo> | <FILL: local checkout path> | <FILL: e.g. k8s manifests/overlays, deploy PRs, gateway config — "this is where deploy actually happens"> |
| <FILL: repo> | <FILL: path> | <FILL: e.g. IaC/terraform — cloud resources, service accounts, networking> |

If a checkout is missing/stale on the machine, say so and flag the uncertainty — pull before trusting details that matter.

## Gateway / routing (if an external gateway fronts this app)

<!-- Where the route config lives, what the gateway matches on, and the coupling rule. Delete
     the section if no gateway. Donor: Ocelot per-service JSON route files (plus a
     replacement-generation NAG config) — any base-prefix change in the app had to be aligned
     there or the renamed routes were unreachable in every gateway-fronted environment. -->

<FILL: gateway config pointer(s) + the alignment rule: a prefix the gateway doesn't route = dead endpoint.>

## Triggers — when you MUST read the infra repos first

1. **Anything "deploy", "environment", "is it running", "rollout", "rollback"** → <FILL: the app's directory in the deploy repo>. Do not assume the app repo's workflows deploy anything — they only publish an artifact.
2. **Designing/altering CI release lanes** → <FILL: the deploy handoff mechanism + reference wiring>.
3. **Route/prefix/wire-contract changes** → <FILL: gateway route config> for what the gateway matches on.
4. **In-cluster/production runtime questions** (env vars, probes, config mounts, migrations-at-deploy, resource limits) → <FILL: the deployment manifests>, not the app repo's local rig (compose files are local-only).
5. **Cloud resources** (databases, service accounts, IAM, networking) → <FILL: IaC repo/paths>.

## Reviewer red flags

- A claim that merging to the app repo's main branch "deploys" anything — it only publishes an artifact; deployment is <FILL: the real mechanism>.
- A route rename/addition shipped without checking the gateway route config — the app serves it, the gateway 404s it.
- Reasoning about production runtime from the local rig (compose/dev scripts) instead of the real deployment manifests.
- Proposing direct-to-environment pushes from CI (<FILL: e.g. helm/kubectl apply>) when the model forbids it — everything goes through <FILL: the sanctioned path>.
