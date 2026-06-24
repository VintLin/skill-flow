import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopUpdateCheckerTests: XCTestCase {
    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testFetchLatestReleaseUsesGitHubLatestReleaseAPI() async throws {
        let releaseURL = URL(string: "https://github.com/VintLin/skill-flow/releases/tag/v1.3.6")!
        let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg")!
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://api.github.com/repos/VintLin/skill-flow/releases/latest")
            XCTAssertEqual(request.httpMethod, "GET")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let body = """
            {
              "tag_name": "v1.3.6",
              "html_url": "\(releaseURL.absoluteString)",
              "assets": [
                {
                  "name": "Skill-Flow-universal.dmg",
                  "browser_download_url": "\(installerURL.absoluteString)"
                }
              ]
            }
            """
            return (response, Data(body.utf8))
        }

        let checker = DesktopGitHubUpdateChecker(session: Self.mockSession())
        let release = try await checker.fetchLatestRelease()

        XCTAssertEqual(release.version, "1.3.6")
        XCTAssertEqual(release.releaseURL, releaseURL)
        XCTAssertEqual(release.installerURL, installerURL)
    }

    func testFetchLatestReleaseRejectsUnexpectedReleaseHost() async {
        MockURLProtocol.requestHandler = { _ in
            let response = HTTPURLResponse(
                url: URL(string: "https://api.github.com/repos/VintLin/skill-flow/releases/latest")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let body = """
            {
              "tag_name": "v1.3.6",
              "html_url": "https://example.com/VintLin/skill-flow/releases/tag/v1.3.6",
              "assets": []
            }
            """
            return (response, Data(body.utf8))
        }

        let checker = DesktopGitHubUpdateChecker(session: Self.mockSession())

        do {
            _ = try await checker.fetchLatestRelease()
            XCTFail("Expected non-tag release URL to fail.")
        } catch let error as DesktopUpdateCheckError {
            XCTAssertEqual(error, .invalidReleaseURL)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPreferredInstallerURLRejectsUnexpectedHost() {
        let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.dmg",
                browserDownloadURL: "https://example.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg"
            ),
        ])

        XCTAssertNil(installerURL)
    }

    func testPreferredInstallerURLRejectsWrongGitHubRepo() {
        let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.dmg",
                browserDownloadURL: "https://github.com/attacker/repo/releases/download/v1.3.6/Skill-Flow-universal.dmg"
            ),
        ])

        XCTAssertNil(installerURL)
    }

    func testPreferredInstallerURLRejectsNonReleaseGitHubPath() {
        let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.dmg",
                browserDownloadURL: "https://github.com/VintLin/skill-flow/raw/main/Skill-Flow-universal.dmg"
            ),
        ])

        XCTAssertNil(installerURL)
    }

    func testPreferredInstallerURLFallsBackToUniversalDMG() {
        let universalURL = "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg"
        let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.dmg",
                browserDownloadURL: universalURL
            ),
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.zip",
                browserDownloadURL: "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.zip"
            ),
        ])

        XCTAssertEqual(installerURL?.absoluteString, universalURL)
    }

    func testPreferredInstallerURLRejectsNonHTTPURL() {
        let installerURL = DesktopGitHubUpdateChecker.preferredInstallerURL(from: [
            GitHubReleaseAsset(
                name: "Skill-Flow-universal.dmg",
                browserDownloadURL: "file:///tmp/Skill-Flow-universal.dmg"
            ),
        ])

        XCTAssertNil(installerURL)
    }

    private static func mockSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class MockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: DesktopUpdateCheckError.invalidResponse)
            return
        }

        do {
            let (response, data) = try requestHandler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
