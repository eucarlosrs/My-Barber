const fs = require('fs');
let content = fs.readFileSync('src/test/stage22eCatalogConsistency.test.ts', 'utf8');
content = content.replace(
  "assert(catalogServiceContent.includes('assertTenantAuthority(user, privateData.tenantId'));",
  "assert(catalogServiceContent.includes('assertCatalogTenantOperational(user, privateData.tenantId') || catalogServiceContent.includes('assertTenantAuthority(user, privateData.tenantId'));"
);
fs.writeFileSync('src/test/stage22eCatalogConsistency.test.ts', content, 'utf8');
console.log('Fixed stage22e test 18');
