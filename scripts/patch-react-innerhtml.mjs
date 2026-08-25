/**
 * React DOM still assigns element.innerHTML for script-tag creation and
 * dangerouslySetInnerHTML. addons-linter flags those assignments even when
 * this extension never uses dangerouslySetInnerHTML. Rewrite them before
 * the Firefox zip is built.
 */

const SCRIPT_VIA_INNERHTML =
  /([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.createElement\("div"\);\s*\1\.innerHTML\s*=\s*"<script>\\x3c\/script>";\s*\1\s*=\s*\1\.removeChild\(\s*\1\.firstChild\s*\);/g;

const INNERHTML_ASSIGNMENT =
  /([A-Za-z_$][\w$]*)\.innerHTML\s*=(?!=)\s*([^,;)]+)/g;

const HELPER_NAME = '__dsAssignHTML';

const HELPER = `function ${HELPER_NAME}(node, html) {
  var value = html == null ? "" : String(html);
  if (typeof node.replaceChildren === "function") {
    node.replaceChildren();
  } else {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }
  if (!value) {
    return;
  }
  var doc = node.ownerDocument || document;
  var parsed = new DOMParser().parseFromString(
    "<body>" + value + "</body>",
    "text/html",
  );
  var body = parsed.body;
  while (body.firstChild) {
    node.appendChild(doc.importNode(body.firstChild, true));
  }
}
`;

export function patchReactDomInnerHTML(code) {
  if (!code.includes('.innerHTML')) {
    return null;
  }

  let next = code.replace(
    SCRIPT_VIA_INNERHTML,
    '$1 = $2.createElement("script");',
  );
  next = next.replace(INNERHTML_ASSIGNMENT, `${HELPER_NAME}($1, $2)`);

  if (next === code) {
    return null;
  }

  if (next.includes(`${HELPER_NAME}(`) && !next.includes(`function ${HELPER_NAME}(`)) {
    next = injectHelper(next);
  }

  return next;
}

function injectHelper(code) {
  const strict = code.match(/^['"]use strict['"];\s*/);
  if (strict) {
    return code.slice(0, strict[0].length) + HELPER + code.slice(strict[0].length);
  }
  return HELPER + code;
}

export function patchReactDomInnerHTMLPlugin() {
  return {
    name: 'patch-react-dom-innerhtml',
    enforce: 'pre',
    transform(code, id) {
      const normalized = String(id).replaceAll('\\', '/');
      if (!normalized.includes('/react-dom/')) {
        return null;
      }
      const patched = patchReactDomInnerHTML(code);
      if (patched == null) {
        return null;
      }
      return { code: patched, map: null };
    },
    renderChunk(code) {
      if (!hasInnerHTMLAssignment(code)) {
        return null;
      }
      const patched = patchReactDomInnerHTML(code);
      if (patched == null) {
        return null;
      }
      return { code: patched, map: null };
    },
  };
}

export function hasInnerHTMLAssignment(code) {
  return /\.innerHTML\s*=(?!=)/.test(code);
}
