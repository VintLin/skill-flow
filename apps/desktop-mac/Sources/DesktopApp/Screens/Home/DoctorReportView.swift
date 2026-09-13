import SwiftUI

struct DoctorReportView: View {
    let report: DoctorReportRow

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(report.status).font(.headline)
                Text(report.scope == "project" ? "Project: \(report.projectPath ?? "Unavailable")" : "Global")
                if let baseline = report.baseline { Text("Deployment baseline: \(baseline)") }
                if let complete = report.coverageComplete { Text("Coverage: \(complete ? "complete" : "incomplete")") }
                if let managed = report.managedSkillCount { Text("Managed Skills: \(managed)") }
                if let external = report.externalSkillCount { Text("External Skills: \(external)") }
                ForEach(report.roots) { root in
                    Text("\(root.status): \(root.path) [\(root.targets.joined(separator: ", "))]")
                        .font(.caption)
                }
                ForEach(report.issues) { issue in
                    Divider()
                    Text("\(issue.severity.uppercased()) · \(issue.code)").font(.headline)
                    Text(issue.message)
                    if issue.sourceId != "-" { Text("Skill group: \(issue.sourceLabel ?? issue.sourceId) [\(issue.sourceId)]") }
                    if let leafId = issue.leafId { Text("Skill: \(issue.leafLabel ?? leafId) [\(leafId)]") }
                    if issue.target != "-" { Text("Agent: \(issue.target)") }
                    if !issue.targets.isEmpty { Text("Agents: \(issue.targets.joined(separator: ", "))") }
                    if let path = issue.path { Text(path).font(.system(.body, design: .monospaced)) }
                    if let advice = issue.advice { Text(advice) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
        }
    }
}
