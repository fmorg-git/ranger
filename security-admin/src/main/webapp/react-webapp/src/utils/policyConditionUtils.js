/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { actionRequirementsRegistry } from "./actionRequirements/registry";

export const sortActionOptions = (options, servicedefName) => {
  if (!Array.isArray(options)) {
    return options;
  }

  const normalized = options
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  if (servicedefName === "ozone") {
    const pinnedOrder = ["*", "Create*", "Delete*", "Get*", "List*", "Put*"];
    const pinned = pinnedOrder.filter((v) => normalized.includes(v));
    const pinnedSet = new Set(pinned);
    const rest = normalized
      .filter((v) => !pinnedSet.has(v))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return [...pinned, ...rest];
  }

  return normalized.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
};

const NONE_RESOURCE_VALUE = "none";

const normalizeStringArray = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
};

const toLowerSet = (values) => {
  const set = new Set();
  for (const v of normalizeStringArray(values)) {
    set.add(v.toLowerCase());
  }
  return set;
};

const hasAll = (required, grantedSet) => {
  if (!Array.isArray(required) || required.length === 0) {
    return true;
  }
  for (const r of required) {
    if (!grantedSet.has(r)) {
      return false;
    }
  }
  return true;
};

export const expandImpliedAccessTypes = (selectedAccessTypes, accessTypeDefs) => {
  const selected = toLowerSet(selectedAccessTypes);

  if (!Array.isArray(accessTypeDefs) || accessTypeDefs.length === 0) {
    return [...selected];
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const def of accessTypeDefs) {
      const name = def?.name;
      const implied = def?.impliedGrants;
      if (!name || !selected.has(String(name).toLowerCase())) {
        continue;
      }
      if (!Array.isArray(implied) || implied.length === 0) {
        continue;
      }
      for (const g of implied) {
        const grant = typeof g === "string" ? g.trim().toLowerCase() : "";
        if (grant && !selected.has(grant)) {
          selected.add(grant);
          changed = true;
        }
      }
    }
  }

  return [...selected];
};

export const getSelectedAccessTypesForRow = (formValues, attrName, index) => {
  const accesses = formValues?.[attrName]?.[index]?.accesses;
  if (!Array.isArray(accesses)) {
    return [];
  }
  return accesses
    .map((a) => (typeof a?.value === "string" ? a.value.trim() : ""))
    .filter((v) => v.length > 0);
};

const CONDITION_ORDER = ["ip-range", "_expression", "action-matches"];

export const sortPolicyConditions = (conditions) => {
  if (!Array.isArray(conditions)) {
    return conditions;
  }
  
  return [...conditions].sort((a, b) => {
    const indexA = CONDITION_ORDER.indexOf(a?.name);
    const indexB = CONDITION_ORDER.indexOf(b?.name);
    
    const rankA = indexA === -1 ? 999 : indexA;
    const rankB = indexB === -1 ? 999 : indexB;

    return rankA - rankB;
  });
};

export const getSelectedLeafResourceTypes = (serviceCompDetails, formValues) => {
  const result = new Set();
  const resources = serviceCompDetails?.resources;
  if (!Array.isArray(resources) || resources.length === 0) {
    return result;
  }

  const levels = [...new Set(resources.map((r) => r?.level).filter(Number.isFinite))]
    .sort((a, b) => a - b);

  const blocks = Array.isArray(formValues?.additionalResources)
    ? formValues.additionalResources
    : [formValues];

  for (const block of blocks) {
    if (!block) {
      continue;
    }

    let leaf = null;
    for (const level of levels) {
      const sel = block[`resourceName-${level}`];
      if (!sel) {
        continue;
      }
      if (sel?.value === NONE_RESOURCE_VALUE) {
        break;
      }
      if (typeof sel?.name === "string" && sel.name.trim().length > 0) {
        leaf = sel.name.trim();
      }
    }

    if (leaf) {
      result.add(leaf);
    }
  }

  return result;
};

const getActionRequirements = (actionRequirements, leafResourceTypes) => {
  if (!actionRequirements || typeof actionRequirements !== 'object') {
    return {};
  }

  // Determine if the action requirements are nested by leaf resource type (like Ozone)
  // or flat (like HDFS).
  // We can do this by checking if any key in actionRequirements maps to another object.
  const isNested = Object.values(actionRequirements).some(v => v && typeof v === 'object' && !Array.isArray(v));

  if (!isNested) {
    // It's flat like HDFS, so return it as a single mapping for any leaf type.
    return { "*": actionRequirements };
  }

  // It's nested like Ozone, so filter it down to the selected leaf types
  const result = {};
  
  if (!leafResourceTypes || leafResourceTypes.size === 0) {
    Object.keys(actionRequirements).forEach(leaf => {
      if (leaf.toLowerCase() !== 'role') {
        result[leaf] = actionRequirements[leaf];
      }
    });
    return Object.keys(result).length > 0 ? result : actionRequirements;
  }

  const loweredLeaves = new Set([...leafResourceTypes].map(l => l.trim().toLowerCase()));
  
  const allLeafTypes = Object.keys(actionRequirements).map(l => l.toLowerCase());
  const nonRoleLeaves = allLeafTypes.filter(l => l !== 'role');
  
  const hasNonRole = nonRoleLeaves.some(t => loweredLeaves.has(t));
  if (!hasNonRole && loweredLeaves.has("role")) {
     result["role"] = actionRequirements.role || actionRequirements[Object.keys(actionRequirements).find(k => k.toLowerCase() === 'role')] || {};
     return result;
  }
  
  for (const leaf of nonRoleLeaves) {
    if (loweredLeaves.has(leaf)) {
      result[leaf] = actionRequirements[Object.keys(actionRequirements).find(k => k.toLowerCase() === leaf)];
    }
  }
  
  if (Object.keys(result).length === 0) {
     nonRoleLeaves.forEach(leaf => {
       result[leaf] = actionRequirements[Object.keys(actionRequirements).find(k => k.toLowerCase() === leaf)];
     });
  }

  return result;
};

const isConcreteActionAllowed = (action, grantedAccessTypes, requirementsByLeaf) => {
  if (!action || typeof action !== "string") {
    return false;
  }

  for (const leaf of Object.keys(requirementsByLeaf)) {
    const reqsByAction = requirementsByLeaf[leaf];
    const actionKey = Object.keys(reqsByAction).find(k => k.toLowerCase() === action.toLowerCase());
    const required = actionKey ? reqsByAction[actionKey] : null;
    
    if (required && hasAll(required, grantedAccessTypes)) {
      return true;
    }
  }

  return false;
};

export const filterActionOptions = ({
  servicedefName,
  baseOptions,
  selectedAccessTypes,
  leafResourceTypes,
  accessTypeDefs,
  actionRequirements
}) => {
  if (!Array.isArray(baseOptions)) {
    return baseOptions;
  }

  const normalizedBase = normalizeStringArray(baseOptions);
  const selectedExpanded = expandImpliedAccessTypes(selectedAccessTypes, accessTypeDefs);
  const granted = toLowerSet(selectedExpanded);

  if (granted.size === 0) {
    return [];
  }

  if (!actionRequirements || Object.keys(actionRequirements).length === 0) {
    return normalizedBase;
  }

  const requirementsByLeaf = getActionRequirements(actionRequirements, leafResourceTypes);
  const isNested = Object.values(actionRequirements).some(v => v && typeof v === 'object' && !Array.isArray(v));

  const getConcreteActions = () => {
    const actions = new Set();
    for (const leaf of Object.keys(requirementsByLeaf)) {
      const reqsByAction = requirementsByLeaf[leaf];
      if (reqsByAction) {
        Object.keys(reqsByAction).forEach(a => actions.add(a));
      }
    }
    return actions;
  };
  const concreteActions = getConcreteActions();

  return normalizedBase.filter((opt) => {
    if (opt === "*") {
      if (granted.has("all")) {
        return true;
      }

      // Only allow "*" when the selected permission-set covers every concrete action
      // described by the relevant actionRequirements.
      if (concreteActions.size === 0) {
        return false;
      }

      for (const a of concreteActions) {
        if (!isConcreteActionAllowed(a, granted, requirementsByLeaf)) {
          return false;
        }
      }

      return true;
    }

    if (opt.endsWith("*")) {
      const prefix = opt.slice(0, -1);
      if (!prefix) return false;

      const candidates = [...concreteActions].filter((a) => a.toLowerCase().startsWith(prefix.toLowerCase()));
      if (candidates.length === 0) {
        return false;
      }

      return candidates.every((a) =>
        isConcreteActionAllowed(a, granted, requirementsByLeaf)
      );
    }

    if (opt.includes("*")) {
      return false;
    }

    const actionKey = [...concreteActions].find(k => k.toLowerCase() === opt.toLowerCase());

    if (!actionKey) {
      return !isNested;
    }

    return isConcreteActionAllowed(opt, granted, requirementsByLeaf);
  });
};

export const getActionMatchesOptions = ({
  servicedefName,
  baseOptions,
  actionFilterContext,
  actionRequirements
}) => {
  let filtered = baseOptions;
  if (actionFilterContext?.selectedAccessTypes) {
    filtered = filterActionOptions({
      servicedefName,
      baseOptions,
      selectedAccessTypes: actionFilterContext.selectedAccessTypes,
      leafResourceTypes: actionFilterContext.leafResourceTypes,
      accessTypeDefs: actionFilterContext.accessTypeDefs,
      actionRequirements
    });
  }
  return sortActionOptions(filtered, servicedefName);
};

export const pruneSelectedActionMatches = ({ selected, allowedOptions }) => {
  if (!Array.isArray(selected)) {
    return selected;
  }
  const allowedSet = new Set(
    (allowedOptions || []).map((a) => (typeof a === "string" ? a.trim() : ""))
  );
  
  const pruned = selected.filter((o) => {
    // selected might be an array of strings or objects {label, value}
    const v = typeof o === "object" ? o?.value : o;
    const normalized = typeof v === "string" ? v.trim() : "";
    return normalized && allowedSet.has(normalized);
  });

  return pruned.length > 0 ? pruned : [];
};

export const buildActionReqsMapFromConditionDef = (conditionDefVal) => {
  const map = {};
  if (!Array.isArray(conditionDefVal) || conditionDefVal.length === 0) {
    return map;
  }

  conditionDefVal.forEach((m) => {
    let uiHintAttb = null;
    try {
      uiHintAttb = m.uiHint != undefined && m.uiHint != "" ? JSON.parse(m.uiHint) : "";
    } catch (e) {
      // ignore
    }

    if (uiHintAttb && uiHintAttb !== "") {
      let fileToLoad = uiHintAttb?.actionRequirementsFile;
      if (fileToLoad && actionRequirementsRegistry[fileToLoad]) {
        map[m.name] = actionRequirementsRegistry[fileToLoad].default || actionRequirementsRegistry[fileToLoad];
      } else if (uiHintAttb?.actionRequirements) {
        map[m.name] = uiHintAttb.actionRequirements;
      }
    }
  });

  return map;
};

