/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.ranger.patch;

import org.apache.commons.lang3.StringUtils;
import org.apache.ranger.biz.RangerBizUtil;
import org.apache.ranger.biz.ServiceDBStore;
import org.apache.ranger.common.JSONUtil;
import org.apache.ranger.common.RangerValidatorFactory;
import org.apache.ranger.common.StringUtil;
import org.apache.ranger.db.RangerDaoManager;
import org.apache.ranger.entity.XXServiceDef;
import org.apache.ranger.plugin.model.RangerServiceDef;
import org.apache.ranger.plugin.model.validation.RangerServiceDefValidator;
import org.apache.ranger.plugin.model.validation.RangerValidator.Action;
import org.apache.ranger.plugin.store.EmbeddedServiceDefsUtil;
import org.apache.ranger.service.RangerPolicyService;
import org.apache.ranger.service.XPermMapService;
import org.apache.ranger.service.XPolicyService;
import org.apache.ranger.util.CLIUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class PatchForHdfsServiceDefPolicyConditionUpdate_J10066 extends BaseLoader {
    private static final Logger logger = LoggerFactory.getLogger(PatchForHdfsServiceDefPolicyConditionUpdate_J10066.class);

    @Autowired
    RangerDaoManager daoMgr;

    @Autowired
    ServiceDBStore svcDBStore;

    @Autowired
    JSONUtil jsonUtil;

    @Autowired
    RangerPolicyService policyService;

    @Autowired
    StringUtil stringUtil;

    @Autowired
    XPolicyService xPolService;

    @Autowired
    XPermMapService xPermMapService;

    @Autowired
    RangerBizUtil bizUtil;

    @Autowired
    RangerValidatorFactory validatorFactory;

    @Autowired
    ServiceDBStore svcStore;

    public static void main(String[] args) {
        logger.info("main()");
        try {
            PatchForHdfsServiceDefPolicyConditionUpdate_J10066 loader = (PatchForHdfsServiceDefPolicyConditionUpdate_J10066) CLIUtil.getBean(PatchForHdfsServiceDefPolicyConditionUpdate_J10066.class);
            loader.init();
            while (loader.isMoreToProcess()) {
                loader.load();
            }
            logger.info("Load complete. Exiting!!!");
            System.exit(0);
        } catch (Exception e) {
            logger.error("Error loading", e);
            System.exit(1);
        }
    }

    @Override
    public void init() throws Exception {
        // Do Nothing
    }

    @Override
    public void printStats() {
        logger.info("PatchForHdfsServiceDefPolicyConditionUpdate_J10066");
    }

    @Override
    public void execLoad() {
        logger.info("==> PatchForHdfsServiceDefPolicyConditionUpdate_J10066.execLoad()");
        try {
            updateHdfsServiceDef();
        } catch (Exception e) {
            logger.error("Error while applying PatchForHdfsServiceDefPolicyConditionUpdate_J10066", e);
        }
        logger.info("<== PatchForHdfsServiceDefPolicyConditionUpdate_J10066.execLoad()");
    }

    private void updateHdfsServiceDef() {
        try {
            final String hdfsServiceDefName = EmbeddedServiceDefsUtil.EMBEDDED_SERVICEDEF_HDFS_NAME;
            final RangerServiceDef embeddedHdfsServiceDef = EmbeddedServiceDefsUtil.instance().getEmbeddedServiceDef(hdfsServiceDefName);

            if (embeddedHdfsServiceDef == null) {
                logger.error("Embedded service-def for {} not found", hdfsServiceDefName);
                return;
            }

            final List<RangerServiceDef.RangerPolicyConditionDef> embeddedPolicyConditions = embeddedHdfsServiceDef.getPolicyConditions();

            if (embeddedPolicyConditions == null) {
                logger.error("Policy conditions are empty in embedded {} service-def", hdfsServiceDefName);
                return;
            }

            XXServiceDef xXServiceDefObj = daoMgr.getXXServiceDef().findByName(hdfsServiceDefName);

            if (xXServiceDefObj == null) {
                logger.error("Service def for {} is not found in DB", hdfsServiceDefName);
                return;
            }

            Map<String, String> serviceDefOptionsPreUpdate = null;
            final String        jsonStrPreUpdate           = xXServiceDefObj.getDefOptions();

            if (StringUtils.isNotEmpty(jsonStrPreUpdate)) {
                serviceDefOptionsPreUpdate = jsonUtil.jsonToMap(jsonStrPreUpdate);
            }

            final RangerServiceDef dbHdfsServiceDef = svcDBStore.getServiceDefByName(hdfsServiceDefName);

            if (dbHdfsServiceDef == null) {
                logger.error("Service def for {} is not found in ServiceDBStore", hdfsServiceDefName);
                return;
            }

            dbHdfsServiceDef.setPolicyConditions(embeddedPolicyConditions);

            final RangerServiceDefValidator validator = validatorFactory.getServiceDefValidator(svcStore);

            validator.validate(dbHdfsServiceDef, Action.UPDATE);

            svcStore.updateServiceDef(dbHdfsServiceDef);

            xXServiceDefObj = daoMgr.getXXServiceDef().findByName(hdfsServiceDefName);

            if (xXServiceDefObj != null) {
                final String        jsonStrPostUpdate           = xXServiceDefObj.getDefOptions();
                Map<String, String> serviceDefOptionsPostUpdate = null;

                if (StringUtils.isNotEmpty(jsonStrPostUpdate)) {
                    serviceDefOptionsPostUpdate = jsonUtil.jsonToMap(jsonStrPostUpdate);
                }

                if (serviceDefOptionsPostUpdate != null && serviceDefOptionsPostUpdate.containsKey(RangerServiceDef.OPTION_ENABLE_DENY_AND_EXCEPTIONS_IN_POLICIES)) {
                    if (serviceDefOptionsPreUpdate == null || !serviceDefOptionsPreUpdate.containsKey(RangerServiceDef.OPTION_ENABLE_DENY_AND_EXCEPTIONS_IN_POLICIES)) {
                        final String preUpdateValue = serviceDefOptionsPreUpdate == null ? null : serviceDefOptionsPreUpdate.get(RangerServiceDef.OPTION_ENABLE_DENY_AND_EXCEPTIONS_IN_POLICIES);

                        if (preUpdateValue == null) {
                            serviceDefOptionsPostUpdate.remove(RangerServiceDef.OPTION_ENABLE_DENY_AND_EXCEPTIONS_IN_POLICIES);
                        } else {
                            serviceDefOptionsPostUpdate.put(RangerServiceDef.OPTION_ENABLE_DENY_AND_EXCEPTIONS_IN_POLICIES, preUpdateValue);
                        }

                        xXServiceDefObj.setDefOptions(jsonUtil.readMapToString(serviceDefOptionsPostUpdate));

                        daoMgr.getXXServiceDef().update(xXServiceDefObj);
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Error while updating hdfs service-def policy conditions", e);
        }
    }
}

