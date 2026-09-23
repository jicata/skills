<!-- TEMPLATE — instantiated by /setup ONLY when interview Q2 surfaces it: the path from
     merged code to a running system leaves this repo (GitOps repos, gateways, IaC).
     Materialize as `.claude/doctrine/deploy-infra-foundation.md`, reached on-trigger via the doctrine index — it bites at ship time rather than while editing a file, so it gets no path-scoped rule. Fill every
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
2. **Designing/altering CI release lanes, or authoring any deploy config** → <FILL: the deploy handoff mechanism + reference wiring>, and the reference sibling's equivalent file — see *Conform to the fleet*.
3. **Route/prefix/wire-contract changes** → <FILL: gateway route config> for what the gateway matches on.
4. **In-cluster/production runtime questions** (env vars, probes, config mounts, migrations-at-deploy, resource limits) → <FILL: the deployment manifests>, not the app repo's local rig (compose files are local-only).
5. **Cloud resources** (databases, service accounts, IAM, networking) → <FILL: IaC repo/paths>.

## Conform to the fleet — author by diffing against a working sibling

**The reference sibling:** <FILL: a service of the same stack that already ships through this exact pipeline, and the path of its deploy config — e.g. its overlay directory in the deploy repo. If this is the first service of its stack in the fleet, say so; then there is no reference and the rest of this section does not apply yet.>

When you author or change **any** infra config for this service — a deployment overlay, the container build, the CI release lane, a gateway route — the default is to make it **as identical as possible to the reference sibling**, deviating only where a real feature difference forces it *and* the deviation can be justified in one line. Every unexplained divergence from a working peer is a latent outage.

**Author by rendering and diffing, not from first principles.** Render both configs to their final form and diff them before shipping:

```
<FILL: the render commands, e.g.
kustomize build <our overlay>        # extract the Deployment, normalise the service name
kustomize build <sibling overlay>
diff>
```

Every remaining line is either a **justified feature delta** (write the one-line why next to it in the PR) or **a bug you just caught for free.** There is no third category. "I wrote it from the base plus what I figured it needed" is the smell; "I copied the sibling and changed only X and Y, because A and B" is the standard.

> **Donor scar (ADF, 2026-07-23):** standing up a new-stack deploy was debugged reactively across **four cluster round-trips** — fix the visible error, redeploy, hit the next. A migration init step placed in the wrong patch file, so the deploy bot never bumped its image tag (stranded on a dead tag); a database URL in the emulator's form instead of the canonical one; a missing `runAsUser` on the init container, so it started before the service-mesh sidecar and its metadata-server call was refused (the actual blocker); no autoscaler. **All four were visible in the sibling's overlay the whole time**, and that overlay was already open. The failure was not where to look — it was authoring divergent config instead of conforming to the working peer. One up-front diff would have surfaced all four at once.

## Reviewer red flags

- A claim that merging to the app repo's main branch "deploys" anything — it only publishes an artifact; deployment is <FILL: the real mechanism>.
- A route rename/addition shipped without checking the gateway route config — the app serves it, the gateway 404s it.
- Reasoning about production runtime from the local rig (compose/dev scripts) instead of the real deployment manifests.
- Proposing direct-to-environment pushes from CI (<FILL: e.g. helm/kubectl apply>) when the model forbids it — everything goes through <FILL: the sanctioned path>.
- Infra config authored **without a render-and-diff against the named reference sibling**, or any structural divergence from it (an extra or missing patch file, a different security context, a non-canonical connection-string shape, a missing autoscaler/probe/annotation) shipped with no one-line justification.
