import SwiftUI

struct HomeScreen: View {
    @Bindable var viewModel: HomeViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Home")
                .font(.title2.weight(.semibold))

            if viewModel.sourceIds.isEmpty {
                Text("No sources available")
                    .foregroundStyle(.secondary)
            } else {
                List(viewModel.sourceIds, id: \.self) { sourceId in
                    Text(sourceId)
                }
            }
        }
        .padding(24)
    }
}
