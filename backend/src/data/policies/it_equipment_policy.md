# IT Equipment and Security Policy

This policy governs the provisioning, security requirements, and lifecycle management of company-issued computing equipment and technical infrastructure access at Nimbus Technologies across all offices and remote locations.

## 4.1 Laptop Request Lead Time and Hardware Provisioning

Nimbus Technologies provides standardized corporate hardware to ensure system reliability and data security:
- Standard Equipment: Standard engineering laptops are high-performance 16-inch laptops with 32GB RAM; non-technical roles receive standard 14-inch laptops with 16GB RAM. Interns receive a designated device from the company loaner laptop pool.
- Request Lead Time: Hiring managers or People Operations must submit the laptop provisioning request at least five (5) business days before the employee's official start date.
- Shipping and Delivery: For remote employees, laptops are shipped via express courier to arrive at least one business day prior to the start date. For office-based employees, the laptop is prepared for collection on Day 1 at the local IT service desk.

## 4.2 Standard Accounts and Single Sign-On (SSO)

All company digital assets and collaboration tools are protected by centralized identity and access management:
- Every new employee is provisioned a company email address (firstname.lastname@nimbus.example) and an Okta Single Sign-On (SSO) account.
- SSO accounts are provisioned three (3) business days prior to the start date in a pending state, activating at 8:00 AM local time on Day 1.
- Multi-Factor Authentication (MFA) is strictly mandatory using the Okta Verify mobile application or hardware security keys; SMS-based verification is not permitted.
- Baseline tools provisioned automatically through SSO include Google Workspace (Gmail, Calendar, Drive), Slack, and the Nimbus Employee Portal.

## 4.3 VPN Client Setup and Network Security

Nimbus Technologies operates a zero-trust network perimeter. Secure VPN client configuration is mandatory for accessing internal resources:
- VPN client setup is required before accessing any internal company systems, code repositories, staging servers, or intranet tools.
- The IT department pre-installs the global VPN client on all corporate laptops before delivery.
- Employees must authenticate to the VPN client using their Okta SSO credentials and MFA token upon booting their laptop.
- Direct external connections to internal development networks, databases, or production environments without an active VPN tunnel are automatically blocked by network firewalls.

## 4.4 Engineering Systems Access (GitHub and AWS)

Access to sensitive engineering and cloud infrastructure is governed by least-privilege principles and compliance gating:
- Access to GitHub enterprise organizations and Amazon Web Services (AWS) console/CLI roles for engineering and product roles is granted only after background check clears.
- Once background verification clearance is formally recorded in the HR system, IT issues GitHub invitations and AWS IAM Identity Center role bindings.
- Engineering team members must configure SSH keys protected by a passphrase and enforce signed commits using GPG or SSH keys on GitHub.
- Production AWS account access requires manager approval, completion of cloud security training, and time-bound approval via the privileged access workflow.

## 4.5 Device Return Policy

All company-provided equipment remains the exclusive property of Nimbus Technologies and must be returned upon separation of employment:
- When an employee resigns or their employment is terminated, all issued devices—including laptops, monitors, external drives, and accessories—must be returned to IT within five (5) business days.
- Remote employees will receive a prepaid, insured shipping box and return label dispatched by the IT logistics team.
- Office-based employees must return all equipment in person to the local IT helpdesk on their final working day.
- Company data must not be wiped, encrypted, or transferred to personal devices before return; IT conducts certified forensic wiping upon receipt.

## 4.6 IT Helpdesk Support and Contact Information

The Nimbus IT Helpdesk provides technical support across all geographic regions and time zones:
- Support Portal: Employees can submit tickets 24/7 through the IT Service Portal at https://servicedesk.nimbus.example.
- Email Contact: Employees who are unable to log into the portal can email the IT helpdesk directly at it-helpdesk@nimbus.example.
- Slack Channel: For urgent daytime assistance, employees can reach out in the #it-helpdesk public Slack channel.
- Operating Hours: The IT service desk offers 24/5 coverage from Monday morning Asia-Pacific time through Friday evening US Pacific time, with on-call emergency support on weekends for critical system outages.
