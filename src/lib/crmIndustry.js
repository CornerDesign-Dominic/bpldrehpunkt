export function crmIndustryValue(partner) {
  return partner?.crmIndustry ?? partner?.companyData?.industry ?? ''
}
