import Foundation
import XCTest

@testable import SkillFlowDesktop

final class DesktopUpdateInstallerTests: XCTestCase {
    override func tearDown() {
        InstallerMockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    @MainActor
    func testInstallDownloadsDMGAndOpensLocalFile() async throws {
        let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg")!
        let downloadsDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: downloadsDirectory) }

        InstallerMockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url, installerURL)
            let response = HTTPURLResponse(
                url: installerURL,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data("dmg".utf8))
        }

        var openedURL: URL?
        try await DesktopUpdateInstaller.install(
            from: installerURL,
            session: Self.mockSession(),
            downloadsDirectory: downloadsDirectory,
            opener: { url in
                openedURL = url
                return true
            }
        )

        let expectedURL = downloadsDirectory.appendingPathComponent("Skill-Flow-universal.dmg")
        XCTAssertEqual(openedURL, expectedURL)
        XCTAssertEqual(try Data(contentsOf: expectedURL), Data("dmg".utf8))
    }

    @MainActor
    func testInstallFailsOnNonSuccessHTTPStatus() async {
        let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg")!
        let downloadsDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: downloadsDirectory) }

        InstallerMockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 500,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data())
        }

        do {
            try await DesktopUpdateInstaller.install(
                from: installerURL,
                session: Self.mockSession(),
                downloadsDirectory: downloadsDirectory,
                opener: { _ in true }
            )
            XCTFail("Expected install to fail.")
        } catch let error as DesktopUpdateInstallError {
            XCTAssertEqual(error, .invalidResponse)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    @MainActor
    func testInstallFailsWhenOpenerReturnsFalse() async throws {
        let installerURL = URL(string: "https://github.com/VintLin/skill-flow/releases/download/v1.3.6/Skill-Flow-universal.dmg")!
        let downloadsDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: downloadsDirectory) }

        InstallerMockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            return (response, Data("dmg".utf8))
        }

        do {
            try await DesktopUpdateInstaller.install(
                from: installerURL,
                session: Self.mockSession(),
                downloadsDirectory: downloadsDirectory,
                opener: { _ in false }
            )
            XCTFail("Expected install to fail when the opener rejects the destination.")
        } catch let error as DesktopUpdateInstallError {
            XCTAssertEqual(error, .openFailed)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private static func mockSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [InstallerMockURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private final class InstallerMockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let requestHandler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: DesktopUpdateInstallError.invalidResponse)
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
