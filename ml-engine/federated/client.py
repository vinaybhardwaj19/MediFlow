import flwr as fl
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import sys
import warnings
warnings.filterwarnings("ignore")

# Define model architecture for Triage Classification
class TriageNet(nn.Module):
    def __init__(self, input_dim=300, num_classes=45):
        super(TriageNet, self).__init__()
        self.fc1 = nn.Linear(input_dim, 128)
        self.fc2 = nn.Linear(128, num_classes)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        return self.fc2(x)

# Define Flower client
class TriageClient(fl.client.NumPyClient):
    def __init__(self, model, trainloader, valloader):
        self.model = model
        self.trainloader = trainloader
        self.valloader = valloader

    def get_parameters(self, config):
        return [val.cpu().numpy() for _, val in self.model.state_dict().items()]

    def set_parameters(self, parameters):
        params_dict = zip(self.model.state_dict().keys(), parameters)
        state_dict = {k: torch.tensor(v) for k, v in params_dict}
        self.model.load_state_dict(state_dict, strict=True)

    def fit(self, parameters, config):
        self.set_parameters(parameters)
        self.model.train()
        criterion = nn.CrossEntropyLoss()
        optimizer = torch.optim.Adam(self.model.parameters())
        
        # Local training epoch
        for _ in range(1):
            for data, target in self.trainloader:
                optimizer.zero_grad()
                loss = criterion(self.model(data), target)
                loss.backward()
                
                # Apply Laplace Mechanism for Differential Privacy on gradients
                for param in self.model.parameters():
                    noise = torch.distributions.laplace.Laplace(0, 0.01).sample(param.grad.shape)
                    param.grad += noise
                
                optimizer.step()
                
        return self.get_parameters(config={}), len(self.trainloader.dataset), {}

    def evaluate(self, parameters, config):
        self.set_parameters(parameters)
        self.model.eval()
        criterion = nn.CrossEntropyLoss()
        loss, correct = 0, 0
        with torch.no_grad():
            for data, target in self.valloader:
                outputs = self.model(data)
                loss += criterion(outputs, target).item()
                correct += (outputs.argmax(1) == target).type(torch.float).sum().item()
        accuracy = correct / len(self.valloader.dataset)
        return float(loss), len(self.valloader.dataset), {"accuracy": float(accuracy)}

def main():
    print("Starting Flower Client with DP Laplace Noise")
    model = TriageNet()
    
    # Simulating a hospital's local siloed dataset
    X = torch.randn(100, 300)
    Y = torch.randint(0, 45, (100,))
    dataset = TensorDataset(X, Y)
    trainloader = DataLoader(dataset, batch_size=16, shuffle=True)
    valloader = DataLoader(dataset, batch_size=16)
    
    fl.client.start_numpy_client(
        server_address="127.0.0.1:8080",
        client=TriageClient(model, trainloader, valloader)
    )

if __name__ == "__main__":
    main()
